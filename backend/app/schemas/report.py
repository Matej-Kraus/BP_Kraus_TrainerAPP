from pydantic import BaseModel, Field


class StatsSumOut(BaseModel):
    games: int

    goals: int
    assists: int
    errors: int
    won_balls: int
    lost_balls: int
    fouls: int
    passes: int
    won_duels: int
    lost_duels: int
    shots_on_goal: int
    shots_off_goal: int
    yellow_cards: int
    red_cards: int
    penalties: int


class TeamSeasonStatsOut(StatsSumOut):
    """Team-wide season aggregates; `games` = distinct matches that have stat rows."""

    season_matches_total: int = Field(
        ...,
        description="Total matches in the season (any status), from the matches table.",
    )
    passes_success: int = Field(
        ...,
        description="Pass events with delta=+1 in this season.",
    )
    passes_unsuccess: int = Field(
        ...,
        description="Pass events with delta=-1 in this season.",
    )
