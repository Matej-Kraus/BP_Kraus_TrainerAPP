from datetime import datetime

from pydantic import BaseModel

from app.schemas.stats import MatchPlayerStatsOut


class PlayerMatchPerformanceRow(BaseModel):
    match_id: int
    match_date: datetime
    opponent: str
    competition: str | None
    status: str
    stats: MatchPlayerStatsOut
    rating: int | None = None
    note: str | None = None
    auto_rating: float
    final_rating: float
    # From pass events: +1 / −1 clicks in live recording (successful vs corrected/removed)
    passes_success: int = 0
    passes_unsuccess: int = 0


class LeaderboardRow(BaseModel):
    player_id: int
    first_name: str
    last_name: str
    jersey_number: int
    games: int
    goals: int
    assists: int
    passes: int
    yellow_cards: int
    red_cards: int
    avg_rating: float | None = None


class TeamMatchBreakdownRow(BaseModel):
    """Per-match team totals (sum over all players) for charts and trends."""

    match_id: int
    match_date: datetime
    opponent: str
    competition: str | None
    status: str
    goals: int
    assists: int
    passes: int
    passes_success: int
    passes_unsuccess: int
    shots_on_goal: int
    shots_off_goal: int
    won_duels: int
    lost_duels: int
    fouls: int
    yellow_cards: int
    red_cards: int

    class Config:
        from_attributes = True

