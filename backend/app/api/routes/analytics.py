from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.match import Match
from app.models.match_player_rating import MatchPlayerRating
from app.models.match_player_stats import MatchPlayerStats
from app.models.player import Player
from app.models.season import Season
from app.models.user import User
from app.schemas.analytics import (
    LeaderboardRow,
    PlayerMatchPerformanceRow,
    TeamMatchBreakdownRow,
)
from app.schemas.stats import MatchPlayerStatsOut

router = APIRouter(tags=["analytics"])


def _clamp(v: float, min_v: float, max_v: float) -> float:
    return min(max_v, max(min_v, v))


def _compute_auto_rating_from_stats(stats: MatchPlayerStats) -> float:
    # Failed passes count against successful ones (as before events v2, when '-' reduced the stat).
    net_passes = max(0, stats.passes - stats.passes_failed)
    positive = (
        stats.goals * 6.3
        + stats.assists * 4.2
        + stats.shots_on_goal * 2.2
        + stats.shots_off_goal * 0.9
        + net_passes * 0.115
        + stats.won_duels * 1.08
        + stats.won_balls * 0.92
        + stats.penalties * 3.0
    )
    negative = (
        stats.errors * 1.05
        + stats.lost_balls * 0.22
        + stats.lost_duels * 0.4
        + stats.fouls * 0.24
        + stats.yellow_cards * 0.85
        + stats.red_cards * 2.7
    )
    activity = (
        net_passes
        + stats.won_duels
        + stats.lost_duels
        + stats.shots_on_goal
        + stats.shots_off_goal
        + stats.won_balls
        + stats.lost_balls
    )
    activity_bonus = min(1.95, activity * 0.035)
    score = positive - negative + activity_bonus + 1.2

    raw_min = -8.0
    raw_max = 12.0
    norm = (score - raw_min) / (raw_max - raw_min)
    scaled = 1 + 9 * _clamp(norm, 0, 1)
    return round(scaled, 1)


@router.get("/players/{player_id}/performance", response_model=list[PlayerMatchPerformanceRow])
def player_performance(
    player_id: int,
    season_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    player = (
        db.query(Player)
        .filter(Player.id == player_id, Player.club_id == current_user.club_id)
        .first()
    )
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    if season_id is not None:
        season = (
            db.query(Season)
            .filter(Season.id == season_id, Season.club_id == current_user.club_id)
            .first()
        )
        if not season:
            raise HTTPException(status_code=404, detail="Season not found")

    q = (
        db.query(Match, MatchPlayerStats, MatchPlayerRating)
        .join(MatchPlayerStats, MatchPlayerStats.match_id == Match.id)
        .outerjoin(
            MatchPlayerRating,
            (MatchPlayerRating.match_id == MatchPlayerStats.match_id)
            & (MatchPlayerRating.player_id == MatchPlayerStats.player_id),
        )
        .filter(
            MatchPlayerStats.player_id == player_id,
            Match.club_id == current_user.club_id,
        )
        .order_by(Match.match_date.asc(), Match.id.asc())
    )
    if season_id is not None:
        q = q.filter(Match.season_id == season_id)

    rows = q.all()

    resp: list[PlayerMatchPerformanceRow] = []
    for (m, s, r) in rows:
        resp.append(
            PlayerMatchPerformanceRow(
                match_id=m.id,
                match_date=m.match_date,
                opponent=m.opponent,
                competition=m.competition,
                status=m.status,
                stats=MatchPlayerStatsOut.model_validate(s),
                rating=(r.rating if r else None),
                note=(r.note if r else None),
                passes_success=s.passes,
                passes_unsuccess=s.passes_failed,
            )
        )
    return resp


@router.get("/seasons/{season_id}/leaderboards", response_model=list[LeaderboardRow])
def season_leaderboards(
    season_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    season = (
        db.query(Season)
        .filter(Season.id == season_id, Season.club_id == current_user.club_id)
        .first()
    )
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    q = (
        db.query(
            Player.id.label("player_id"),
            Player.first_name,
            Player.last_name,
            Player.jersey_number,
            MatchPlayerStats,
            MatchPlayerRating.rating.label("coach_rating"),
        )
        .join(MatchPlayerStats, MatchPlayerStats.player_id == Player.id)
        .join(Match, Match.id == MatchPlayerStats.match_id)
        .outerjoin(
            MatchPlayerRating,
            (MatchPlayerRating.match_id == MatchPlayerStats.match_id)
            & (MatchPlayerRating.player_id == MatchPlayerStats.player_id),
        )
        .filter(
            Player.club_id == current_user.club_id,
            Match.club_id == current_user.club_id,
            Match.season_id == season_id,
        )
        .order_by(Match.match_date.asc(), Match.id.asc())
    )

    aggregates: dict[int, dict] = {}
    for row in q.all():
        pid = int(row.player_id)
        stats: MatchPlayerStats = row.MatchPlayerStats
        coach_rating = row.coach_rating

        if pid not in aggregates:
            aggregates[pid] = {
                "player_id": pid,
                "first_name": row.first_name,
                "last_name": row.last_name,
                "jersey_number": int(row.jersey_number),
                "games": 0,
                "goals": 0,
                "assists": 0,
                "passes": 0,
                "yellow_cards": 0,
                "red_cards": 0,
                "rating_sum": 0.0,
                "rating_count": 0,
            }

        agg = aggregates[pid]
        agg["games"] += 1
        agg["goals"] += int(stats.goals or 0)
        agg["assists"] += int(stats.assists or 0)
        agg["passes"] += int(stats.passes or 0)
        agg["yellow_cards"] += int(stats.yellow_cards or 0)
        agg["red_cards"] += int(stats.red_cards or 0)

        final_rating = float(coach_rating) if coach_rating is not None else _compute_auto_rating_from_stats(stats)
        agg["rating_sum"] += final_rating
        agg["rating_count"] += 1

    resp: list[LeaderboardRow] = []
    for agg in aggregates.values():
        avg_rating = (
            round(agg["rating_sum"] / agg["rating_count"], 2)
            if agg["rating_count"] > 0
            else None
        )
        resp.append(
            LeaderboardRow(
                player_id=agg["player_id"],
                first_name=agg["first_name"],
                last_name=agg["last_name"],
                jersey_number=agg["jersey_number"],
                games=agg["games"],
                goals=agg["goals"],
                assists=agg["assists"],
                passes=agg["passes"],
                yellow_cards=agg["yellow_cards"],
                red_cards=agg["red_cards"],
                avg_rating=avg_rating,
            )
        )

    resp.sort(key=lambda r: (r.goals, r.assists, r.avg_rating or 0), reverse=True)
    return resp


@router.get(
    "/seasons/{season_id}/team-matches-breakdown",
    response_model=list[TeamMatchBreakdownRow],
)
def team_matches_breakdown(
    season_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Per-match aggregated team stats (sum over roster) for timeline charts."""
    season = (
        db.query(Season)
        .filter(Season.id == season_id, Season.club_id == current_user.club_id)
        .first()
    )
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    rows = (
        db.query(
            Match.id.label("match_id"),
            Match.match_date,
            Match.opponent,
            Match.competition,
            Match.status,
            func.coalesce(func.sum(MatchPlayerStats.goals), 0).label("goals"),
            func.coalesce(func.sum(MatchPlayerStats.assists), 0).label("assists"),
            func.coalesce(func.sum(MatchPlayerStats.passes), 0).label("passes"),
            func.coalesce(func.sum(MatchPlayerStats.passes), 0).label("passes_success"),
            func.coalesce(func.sum(MatchPlayerStats.passes_failed), 0).label(
                "passes_unsuccess"
            ),
            func.coalesce(func.sum(MatchPlayerStats.shots_on_goal), 0).label(
                "shots_on_goal"
            ),
            func.coalesce(func.sum(MatchPlayerStats.shots_off_goal), 0).label(
                "shots_off_goal"
            ),
            func.coalesce(func.sum(MatchPlayerStats.won_duels), 0).label("won_duels"),
            func.coalesce(func.sum(MatchPlayerStats.lost_duels), 0).label("lost_duels"),
            func.coalesce(func.sum(MatchPlayerStats.fouls), 0).label("fouls"),
            func.coalesce(func.sum(MatchPlayerStats.yellow_cards), 0).label(
                "yellow_cards"
            ),
            func.coalesce(func.sum(MatchPlayerStats.red_cards), 0).label("red_cards"),
        )
        .outerjoin(MatchPlayerStats, MatchPlayerStats.match_id == Match.id)
        .filter(Match.season_id == season_id, Match.club_id == current_user.club_id)
        .group_by(Match.id)
        .order_by(Match.match_date.asc(), Match.id.asc())
        .all()
    )

    def zi(x) -> int:
        return int(x or 0)

    out: list[TeamMatchBreakdownRow] = []
    for row in rows:
        out.append(
            TeamMatchBreakdownRow(
                match_id=row.match_id,
                match_date=row.match_date,
                opponent=row.opponent,
                competition=row.competition,
                status=row.status,
                goals=zi(row.goals),
                assists=zi(row.assists),
                passes=zi(row.passes),
                passes_success=zi(row.passes_success),
                passes_unsuccess=zi(row.passes_unsuccess),
                shots_on_goal=zi(row.shots_on_goal),
                shots_off_goal=zi(row.shots_off_goal),
                won_duels=zi(row.won_duels),
                lost_duels=zi(row.lost_duels),
                fouls=zi(row.fouls),
                yellow_cards=zi(row.yellow_cards),
                red_cards=zi(row.red_cards),
            )
        )
    return out
