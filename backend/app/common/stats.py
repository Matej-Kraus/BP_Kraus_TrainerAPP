"""Single source of truth for the per-player stat columns and their aggregation."""

from sqlalchemy import func

from app.models.match_player_stats import MatchPlayerStats

STAT_COLUMNS: tuple[str, ...] = (
    "goals",
    "assists",
    "errors",
    "won_balls",
    "lost_balls",
    "fouls",
    "passes",
    "passes_failed",
    "won_duels",
    "lost_duels",
    "shots_on_goal",
    "shots_off_goal",
    "yellow_cards",
    "red_cards",
    "penalties",
)


def stat_sum_columns() -> list:
    """SUM(...) labelled by column name, for use in db.query(...) over MatchPlayerStats."""
    return [func.sum(getattr(MatchPlayerStats, c)).label(c) for c in STAT_COLUMNS]


def zero_stats() -> dict[str, int]:
    return {c: 0 for c in STAT_COLUMNS}


def row_to_stats(row) -> dict[str, int]:
    """Convert an aggregate row (SUM may be NULL) or a MatchPlayerStats object to ints."""
    return {c: int(getattr(row, c) or 0) for c in STAT_COLUMNS}
