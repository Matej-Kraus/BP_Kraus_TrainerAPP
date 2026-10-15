from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Iterable

from sqlalchemy.orm import Session

from app.models.match import Match
from app.models.match_event import MatchEvent
from app.models.match_lineup import MatchLineup
from app.models.match_player_rating import MatchPlayerRating
from app.models.match_player_stats import MatchPlayerStats
from app.models.match_substitution import MatchSubstitution
from app.models.player import Player
from app.models.season_player import SeasonPlayer
from app.services.stats_service import apply_event_to_match_stats
from app.util.time import utcnow

MAX_MATCH_SECOND = 90 * 60


@dataclass
class SubPlan:
    second_in_match: int
    half: int
    player_out_id: int
    player_in_id: int


@dataclass
class MatchProfile:
    tempo: float
    aggression: float
    passing_quality: float
    finishing: float
    error_rate: float
    planned_goals: int


def sample_match_profile(rng: random.Random) -> MatchProfile:
    """Create a per-match profile so each generated game has unique character."""
    return MatchProfile(
        tempo=rng.uniform(0.88, 1.22),
        aggression=rng.uniform(0.85, 1.25),
        passing_quality=rng.uniform(0.85, 1.20),
        finishing=rng.uniform(0.75, 1.30),
        error_rate=rng.uniform(0.75, 1.30),
        planned_goals=rng.choices([0, 1, 2, 3, 4, 5], weights=[6, 20, 30, 24, 14, 6], k=1)[0],
    )


def build_player_position_map(db: Session, player_ids: Iterable[int]) -> dict[int, str]:
    rows = db.query(Player.id, Player.position).filter(Player.id.in_(list(player_ids))).all()
    return {player_id: (position or "").upper() for player_id, position in rows}


def delete_match_data(db: Session, match_id: int) -> None:
    db.query(MatchEvent).filter(MatchEvent.match_id == match_id).delete(synchronize_session=False)
    db.query(MatchPlayerStats).filter(MatchPlayerStats.match_id == match_id).delete(
        synchronize_session=False
    )
    db.query(MatchPlayerRating).filter(MatchPlayerRating.match_id == match_id).delete(
        synchronize_session=False
    )
    db.query(MatchSubstitution).filter(MatchSubstitution.match_id == match_id).delete(
        synchronize_session=False
    )
    db.query(MatchLineup).filter(MatchLineup.match_id == match_id).delete(synchronize_session=False)
    db.commit()


def ensure_lineup(db: Session, match: Match, club_id: int) -> list[MatchLineup]:
    existing = (
        db.query(MatchLineup)
        .filter(MatchLineup.match_id == match.id)
        .order_by(MatchLineup.id.asc())
        .all()
    )
    if existing:
        return existing

    players = (
        db.query(Player)
        .join(SeasonPlayer, SeasonPlayer.player_id == Player.id)
        .filter(
            Player.club_id == club_id,
            SeasonPlayer.season_id == match.season_id,
            Player.archived_at.is_(None),
        )
        .order_by(Player.jersey_number.asc())
        .all()
    )
    if len(players) < 12:
        raise RuntimeError("Need at least 12 players in season to generate matches")

    gks = [p for p in players if (p.position or "").upper() == "GK"]
    outfield = [p for p in players if p not in gks]

    if len(outfield) < 10:
        raise RuntimeError("Need at least 10 outfield players in season to generate matches")

    rng = random.Random(match.id * 9973 + match.season_id)
    by_pos: dict[str, list[Player]] = {"DF": [], "MF": [], "FW": [], "OTHER": []}
    for p in outfield:
        pos = (p.position or "").upper()
        if pos in {"DF", "MF", "FW"}:
            by_pos[pos].append(p)
        else:
            by_pos["OTHER"].append(p)

    starter_gk = rng_choice(gks, random.Random(match.id)) if gks else None

    # Keep a realistic baseline shape close to 4-4-2.
    target = {"DF": 4, "MF": 4, "FW": 2}
    starters_outfield: list[Player] = []
    for pos, count in target.items():
        pool = by_pos[pos][:]
        rng.shuffle(pool)
        starters_outfield.extend(pool[: min(count, len(pool))])

    # Fill missing outfield slots from remaining players regardless of position.
    used_ids = {p.id for p in starters_outfield}
    remaining = [p for p in outfield if p.id not in used_ids]
    rng.shuffle(remaining)
    if len(starters_outfield) < 10:
        need = 10 - len(starters_outfield)
        starters_outfield.extend(remaining[:need])

    starters = ([starter_gk] if starter_gk is not None else []) + starters_outfield
    if len(starters) < 11:
        missing = 11 - len(starters)
        filler_pool = [p for p in players if p.id not in {s.id for s in starters}]
        starters.extend(rng.sample(filler_pool, missing))

    remaining = [p for p in players if p.id not in {s.id for s in starters}]
    rng.shuffle(remaining)
    bench = remaining[: min(len(remaining), 7)]
    for p in starters:
        db.add(
            MatchLineup(
                match_id=match.id,
                player_id=p.id,
                jersey_number_match=p.jersey_number,
                role="starter",
            )
        )
    for p in bench:
        db.add(
            MatchLineup(
                match_id=match.id,
                player_id=p.id,
                jersey_number_match=p.jersey_number,
                role="sub",
            )
        )
    db.commit()
    return (
        db.query(MatchLineup)
        .filter(MatchLineup.match_id == match.id)
        .order_by(MatchLineup.id.asc())
        .all()
    )


def plan_substitutions(
    *,
    starters: list[int],
    bench: list[int],
    rng: random.Random,
    min_subs: int = 2,
    max_subs: int = 5,
    player_positions: dict[int, str] | None = None,
    match_profile: MatchProfile | None = None,
) -> list[SubPlan]:
    if not starters or not bench:
        return []

    profile = match_profile or sample_match_profile(rng)
    positions = player_positions or {}

    desired = 3 if profile.tempo < 1.0 else 4
    desired = max(min_subs, min(max_subs, desired))
    sub_count = min(desired, len(bench), len(starters))
    sub_count = max(min_subs, sub_count)
    sub_count = min(sub_count, len(bench), len(starters))

    out_ids = [pid for pid in starters if positions.get(pid) != "GK"] or starters[:]
    in_ids = [pid for pid in bench if positions.get(pid) != "GK"] or bench[:]
    rng.shuffle(out_ids)
    rng.shuffle(in_ids)
    minute_pool = [54, 58, 61, 64, 68, 72, 76, 80, 84, 87]
    minutes = sorted(rng.sample(minute_pool, k=sub_count))

    plans: list[SubPlan] = []
    for i in range(sub_count):
        sec = max(1, min(MAX_MATCH_SECOND, minutes[i] * 60 + rng.randint(0, 45)))
        plans.append(
            SubPlan(
                second_in_match=sec,
                half=1 if sec < 45 * 60 else 2,
                player_out_id=out_ids[i],
                player_in_id=in_ids[i],
            )
        )
    return sorted(plans, key=lambda p: p.second_in_match)


def create_substitutions(db: Session, match: Match, plans: list[SubPlan]) -> None:
    for p in plans:
        db.add(
            MatchSubstitution(
                match_id=match.id,
                player_out_id=p.player_out_id,
                player_in_id=p.player_in_id,
                half=p.half,
                second_in_match=p.second_in_match,
            )
        )
    db.commit()


def generate_events(
    db: Session,
    *,
    match: Match,
    lineup_rows: list[MatchLineup],
    plans: list[SubPlan],
    total_events: int,
    rng: random.Random,
    player_positions: dict[int, str] | None = None,
    match_profile: MatchProfile | None = None,
) -> None:
    profile = match_profile or sample_match_profile(rng)
    positions = player_positions or {}
    lineup_ids = [r.player_id for r in lineup_rows]
    for pid in lineup_ids:
        positions.setdefault(pid, "")

    baseline_total = 760
    intensity = max(0.72, min(1.35, total_events / baseline_total))
    player_intervals = _build_player_intervals(lineup_rows, plans)
    events: list[tuple[int, int, str, int]] = []
    goals_timestamps: list[tuple[int, int]] = []

    for pid in lineup_ids:
        pos = (positions.get(pid, "") or "").upper()
        intervals = player_intervals.get(pid, [])
        share = _minute_share(intervals)
        if share <= 0.05:
            continue

        passes_min, passes_max = _range_for_position(pos, "passes")
        passes_total = _random_int_scaled(rng, passes_min, passes_max, share, intensity, profile.tempo)
        pass_success_rate = _pass_success_rate(rng, pos, profile)
        pass_success = max(0, min(passes_total, int(round(passes_total * pass_success_rate))))
        pass_fail = max(0, passes_total - pass_success)

        duels_min, duels_max = _range_for_position(pos, "duels")
        duels_total = _random_int_scaled(rng, duels_min, duels_max, share, intensity, 1.0)
        duel_win_rate = _duel_win_rate(rng, pos, profile)
        won_duels = max(0, min(duels_total, int(round(duels_total * duel_win_rate))))
        lost_duels = max(0, duels_total - won_duels)

        shots_min, shots_max = _range_for_position(pos, "shots")
        shots_total = _random_int_scaled(rng, shots_min, shots_max, share, intensity, profile.finishing)
        on_target_rate = _on_target_rate(rng, pos, profile)
        shots_on = max(0, min(shots_total, int(round(shots_total * on_target_rate))))
        shots_off = max(0, shots_total - shots_on)

        won_balls_min, won_balls_max = _range_for_position(pos, "won_balls")
        won_balls = _random_int_scaled(rng, won_balls_min, won_balls_max, share, intensity, profile.aggression)
        lost_balls_min, lost_balls_max = _range_for_position(pos, "lost_balls")
        lost_balls = _random_int_scaled(rng, lost_balls_min, lost_balls_max, share, intensity, profile.error_rate)
        lost_balls += pass_fail

        fouls_min, fouls_max = _range_for_position(pos, "fouls")
        fouls = _random_int_scaled(rng, fouls_min, fouls_max, share, intensity, profile.aggression)
        yellow_cards = 0
        for _ in range(fouls):
            if rng.random() < max(0.04, min(0.30, 0.08 + (profile.aggression - 1.0) * 0.2)):
                yellow_cards += 1

        penalties = 1 if rng.random() < (0.02 if pos == "FW" else 0.01 if pos == "MF" else 0.003) else 0
        errors = _random_int_scaled(rng, 0, 2 if pos != "GK" else 3, share, intensity, profile.error_rate)

        goals = _sample_goal_count(rng, pos, share, profile, shots_on)

        events.extend((sec, pid, "pass", 1) for sec in _seconds_for_player(rng, intervals, pass_success))
        events.extend((sec, pid, "pass", -1) for sec in _seconds_for_player(rng, intervals, pass_fail))
        events.extend((sec, pid, "won_duel", 1) for sec in _seconds_for_player(rng, intervals, won_duels))
        events.extend((sec, pid, "lost_duel", 1) for sec in _seconds_for_player(rng, intervals, lost_duels))
        events.extend((sec, pid, "won_ball", 1) for sec in _seconds_for_player(rng, intervals, won_balls))
        events.extend((sec, pid, "lost_ball", 1) for sec in _seconds_for_player(rng, intervals, lost_balls))
        events.extend((sec, pid, "foul", 1) for sec in _seconds_for_player(rng, intervals, fouls))
        events.extend((sec, pid, "shot_on_goal", 1) for sec in _seconds_for_player(rng, intervals, shots_on))
        events.extend((sec, pid, "shot_off_goal", 1) for sec in _seconds_for_player(rng, intervals, shots_off))
        events.extend((sec, pid, "yellow_card", 1) for sec in _seconds_for_player(rng, intervals, yellow_cards))
        events.extend((sec, pid, "penalty", 1) for sec in _seconds_for_player(rng, intervals, penalties))
        events.extend((sec, pid, "error", 1) for sec in _seconds_for_player(rng, intervals, errors))

        goal_secs = _seconds_for_player(rng, intervals, goals)
        for sec in goal_secs:
            events.append((sec, pid, "goal", 1))
            goals_timestamps.append((sec, pid))

    for goal_sec, scorer_id in goals_timestamps:
        if rng.random() > 0.74:
            continue
        on_field = _on_field_players_at(goal_sec, player_intervals)
        candidates = [pid for pid in on_field if pid != scorer_id]
        if not candidates:
            continue
        assist_weights = []
        for pid in candidates:
            pos = (positions.get(pid, "") or "").upper()
            assist_weights.append(1.25 if pos == "MF" else 1.10 if pos == "FW" else 0.90 if pos == "DF" else 0.45)
        assist_player = rng.choices(candidates, weights=assist_weights, k=1)[0]
        events.append((min(MAX_MATCH_SECOND, goal_sec + rng.randint(0, 6)), assist_player, "assist", 1))

    # Rare red cards independent from regular foul/yellow stream.
    if lineup_ids:
        red_events = rng.choices([0, 1, 2], weights=[88, 10, 2], k=1)[0]
        for _ in range(red_events):
            sec = _pick_match_second(rng, profile)
            on_field = _on_field_players_at(sec, player_intervals)
            if not on_field:
                continue
            candidate_weights = []
            for pid in on_field:
                pos = (positions.get(pid, "") or "").upper()
                candidate_weights.append(1.2 if pos in {"DF", "MF"} else 0.9 if pos == "FW" else 0.4)
            rc_player = rng.choices(on_field, weights=candidate_weights, k=1)[0]
            events.append((sec, rc_player, "red_card", 1))

    events.sort(key=lambda x: (x[0], x[1], x[2], x[3]))
    for second, player_id, event_type, delta in events:
        half = 1 if second < 45 * 60 else 2
        db.add(
            MatchEvent(
                match_id=match.id,
                player_id=player_id,
                event_type=event_type,
                delta=delta,
                half=half,
                second_in_match=second,
                created_at=utcnow(),
            )
        )
        apply_event_to_match_stats(db, match.id, player_id, event_type, delta)

    db.commit()
    match.status = "finished"
    match.live_started_at = None
    match.seconds_before_live = 90 * 60 + rng.randint(60, 300)
    db.commit()


def _pick_match_second(rng: random.Random, profile: MatchProfile) -> int:
    # More realistic pressure curve: middle-heavy with stronger late-game tails.
    blocks = [
        (1, 15, 0.90 * profile.tempo),
        (16, 30, 1.05 * profile.tempo),
        (31, 45, 1.20 * profile.tempo),
        (46, 60, 1.00 * profile.tempo),
        (61, 75, 1.15 * profile.tempo),
        (76, 90, 1.25 * profile.tempo),
    ]
    minute_ranges = [(start, end) for start, end, _ in blocks]
    minute_weights = [weight for _, _, weight in blocks]
    start, end = rng.choices(minute_ranges, weights=minute_weights, k=1)[0]
    minute = rng.randint(start, end)
    second = (minute - 1) * 60 + rng.randint(0, 59)
    return max(1, min(MAX_MATCH_SECOND, second))


def _build_player_intervals(
    lineup_rows: list[MatchLineup], plans: list[SubPlan]
) -> dict[int, list[tuple[int, int]]]:
    intervals: dict[int, list[tuple[int, int]]] = {}
    starters = {r.player_id for r in lineup_rows if r.role == "starter"}
    for pid in starters:
        intervals[pid] = [(1, MAX_MATCH_SECOND)]

    for plan in sorted(plans, key=lambda p: p.second_in_match):
        out_pid = plan.player_out_id
        in_pid = plan.player_in_id
        sec = max(1, min(MAX_MATCH_SECOND, plan.second_in_match))
        current = intervals.get(out_pid, [])
        if current:
            s, e = current[-1]
            if s <= sec <= e:
                current[-1] = (s, max(s, sec - 1))
        intervals.setdefault(in_pid, []).append((sec, MAX_MATCH_SECOND))
    return intervals


def _minute_share(intervals: list[tuple[int, int]]) -> float:
    if not intervals:
        return 0.0
    covered = 0
    for start, end in intervals:
        covered += max(0, end - start + 1)
    return max(0.0, min(1.0, covered / MAX_MATCH_SECOND))


def _range_for_position(position: str, metric: str) -> tuple[int, int]:
    pos = (position or "").upper()
    tables: dict[str, dict[str, tuple[int, int]]] = {
        "GK": {"passes": (18, 40), "duels": (0, 4), "shots": (0, 0), "fouls": (0, 1), "won_balls": (0, 2), "lost_balls": (1, 5)},
        "DF": {"passes": (50, 95), "duels": (12, 25), "shots": (0, 1), "fouls": (1, 3), "won_balls": (4, 10), "lost_balls": (5, 15)},
        "MF": {"passes": (62, 120), "duels": (10, 22), "shots": (1, 3), "fouls": (1, 3), "won_balls": (4, 10), "lost_balls": (7, 20)},
        "FW": {"passes": (20, 48), "duels": (8, 16), "shots": (2, 5), "fouls": (0, 2), "won_balls": (3, 8), "lost_balls": (6, 18)},
    }
    group = tables.get(pos, tables["MF"])
    return group[metric]


def _random_int_scaled(
    rng: random.Random,
    base_min: int,
    base_max: int,
    minute_share: float,
    intensity: float,
    profile_factor: float,
) -> int:
    if base_max <= 0:
        return 0
    lo = max(0.0, base_min * minute_share * intensity * profile_factor)
    hi = max(lo, base_max * minute_share * intensity * profile_factor)
    if hi < 1:
        return 0
    return max(0, int(round(rng.uniform(lo, hi))))


def _pass_success_rate(rng: random.Random, position: str, profile: MatchProfile) -> float:
    pos = (position or "").upper()
    base = 0.73 if pos == "DF" else 0.78 if pos == "MF" else 0.70 if pos == "FW" else 0.76
    tuned = base + (profile.passing_quality - 1.0) * 0.18 + rng.uniform(-0.05, 0.05)
    return max(0.60, min(0.92, tuned))


def _duel_win_rate(rng: random.Random, position: str, profile: MatchProfile) -> float:
    pos = (position or "").upper()
    base = 0.52 if pos == "DF" else 0.51 if pos == "MF" else 0.49 if pos == "FW" else 0.46
    tuned = base + (profile.aggression - 1.0) * 0.10 + rng.uniform(-0.06, 0.06)
    return max(0.40, min(0.68, tuned))


def _on_target_rate(rng: random.Random, position: str, profile: MatchProfile) -> float:
    pos = (position or "").upper()
    base = 0.36 if pos == "DF" else 0.39 if pos == "MF" else 0.43 if pos == "FW" else 0.0
    tuned = base + (profile.finishing - 1.0) * 0.10 + rng.uniform(-0.05, 0.05)
    return max(0.30, min(0.50, tuned))


def _sample_goal_count(
    rng: random.Random,
    position: str,
    minute_share: float,
    profile: MatchProfile,
    shots_on: int,
) -> int:
    pos = (position or "").upper()
    if shots_on <= 0:
        return 0
    if pos == "FW":
        choices, weights = [0, 1, 2, 3], [45, 34, 17, 4]
    elif pos == "MF":
        choices, weights = [0, 1, 2], [68, 27, 5]
    elif pos == "DF":
        choices, weights = [0, 1], [91, 9]
    else:
        choices, weights = [0], [100]
    sampled = rng.choices(choices, weights=weights, k=1)[0]
    scaled = int(round(sampled * minute_share * (0.9 + (profile.finishing - 1.0) * 0.5)))
    return max(0, min(shots_on, scaled))


def _seconds_for_player(
    rng: random.Random,
    intervals: list[tuple[int, int]],
    count: int,
) -> list[int]:
    if count <= 0 or not intervals:
        return []
    weighted = []
    weights = []
    for start, end in intervals:
        length = max(0, end - start + 1)
        if length <= 0:
            continue
        weighted.append((start, end))
        weights.append(length)
    if not weighted:
        return []
    out = []
    for _ in range(count):
        start, end = rng.choices(weighted, weights=weights, k=1)[0]
        out.append(rng.randint(start, end))
    return out


def _on_field_players_at(second: int, intervals: dict[int, list[tuple[int, int]]]) -> list[int]:
    out = []
    for pid, spans in intervals.items():
        for start, end in spans:
            if start <= second <= end:
                out.append(pid)
                break
    return out


def rng_choice(players: list[Player], rng: random.Random) -> Player:
    return players[rng.randrange(0, len(players))]
