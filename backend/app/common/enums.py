"""Domain enums and allowed value sets. Used in schemas and validation."""

from enum import Enum


class EventType(str, Enum):
    goal = "goal"
    assist = "assist"
    error = "error"
    won_ball = "won_ball"
    lost_ball = "lost_ball"
    foul = "foul"
    pass_ = "pass"
    pass_failed = "pass_failed"
    won_duel = "won_duel"
    lost_duel = "lost_duel"
    shot_on_goal = "shot_on_goal"
    shot_off_goal = "shot_off_goal"
    yellow_card = "yellow_card"
    red_card = "red_card"
    penalty = "penalty"


# Set for fast lookup (e.g. in stats_service EVENT_TO_COLUMN)
ALLOWED_EVENT_TYPES = {e.value for e in EventType}


class LineupRole(str, Enum):
    starter = "starter"
    sub = "sub"


class MatchStatus(str, Enum):
    planned = "planned"
    live_half_1 = "live_half_1"
    half_time = "half_time"
    live_half_2 = "live_half_2"
    finished = "finished"


class UserRole(str, Enum):
    coach = "coach"
    assistant = "assistant"
