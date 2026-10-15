"""Match statistics are derived data: they are always recomputed from the event log."""

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.match_event import MatchEvent
from app.models.match_player_stats import MatchPlayerStats

EVENT_TO_COLUMN = {
    "goal": "goals",
    "assist": "assists",
    "error": "errors",
    "won_ball": "won_balls",
    "lost_ball": "lost_balls",
    "foul": "fouls",
    "pass": "passes",
    "pass_failed": "passes_failed",
    "won_duel": "won_duels",
    "lost_duel": "lost_duels",
    "shot_on_goal": "shots_on_goal",
    "shot_off_goal": "shots_off_goal",
    "yellow_card": "yellow_cards",
    "red_card": "red_cards",
    "penalty": "penalties",
}


def get_or_create_match_stats(db: Session, match_id: int, player_id: int) -> MatchPlayerStats:
    row = (
        db.query(MatchPlayerStats)
        .filter(MatchPlayerStats.match_id == match_id, MatchPlayerStats.player_id == player_id)
        .first()
    )
    if row:
        return row

    row = MatchPlayerStats(match_id=match_id, player_id=player_id)
    db.add(row)
    db.flush()  # dostane id bez commit
    return row


def _event_counts(db: Session, match_id: int, player_id: int | None = None) -> dict[int, dict[str, int]]:
    """Count of live (non-deleted) events per player and event type."""
    q = db.query(MatchEvent.player_id, MatchEvent.event_type, func.count(MatchEvent.id)).filter(
        MatchEvent.match_id == match_id,
        MatchEvent.deleted_at.is_(None),
        MatchEvent.delta == 1,
    )
    if player_id is not None:
        q = q.filter(MatchEvent.player_id == player_id)
    counts: dict[int, dict[str, int]] = {}
    for pid, event_type, count in q.group_by(MatchEvent.player_id, MatchEvent.event_type).all():
        counts.setdefault(int(pid), {})[event_type] = int(count)
    return counts


def _apply_counts(row: MatchPlayerStats, counts: dict[str, int]) -> None:
    for event_type, column in EVENT_TO_COLUMN.items():
        setattr(row, column, counts.get(event_type, 0))


def recompute_player_stats(db: Session, match_id: int, player_id: int) -> MatchPlayerStats:
    """Rebuild one player's stats row from the event log (call after flushing event changes)."""
    counts = _event_counts(db, match_id, player_id).get(player_id, {})
    row = get_or_create_match_stats(db, match_id, player_id)
    _apply_counts(row, counts)
    return row


def recompute_match_stats(db: Session, match_id: int) -> None:
    """Rebuild stats of every player of a match (bulk path, e.g. match generator)."""
    counts = _event_counts(db, match_id)
    existing = {
        r.player_id: r
        for r in db.query(MatchPlayerStats).filter(MatchPlayerStats.match_id == match_id).all()
    }
    for player_id in set(counts) | set(existing):
        row = existing.get(player_id) or get_or_create_match_stats(db, match_id, player_id)
        _apply_counts(row, counts.get(player_id, {}))
