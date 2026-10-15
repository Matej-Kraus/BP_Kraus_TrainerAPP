from pydantic import BaseModel


class MatchPlayerStatsOut(BaseModel):
    match_id: int
    player_id: int

    goals: int
    assists: int
    errors: int
    won_balls: int
    lost_balls: int
    fouls: int
    passes: int
    passes_failed: int
    won_duels: int
    lost_duels: int
    shots_on_goal: int
    shots_off_goal: int
    yellow_cards: int
    red_cards: int
    penalties: int

    class Config:
        from_attributes = True
