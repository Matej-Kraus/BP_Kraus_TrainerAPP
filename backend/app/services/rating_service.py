"""Single definition of player ratings (1-10) used by every endpoint.

auto_rating   - computed from the match statistics
final_rating  - auto rating, adjusted by the coach's mark when there is one
"""

import math

from app.models.match_player_stats import MatchPlayerStats

# The coach's mark only adjusts the system rating, it does not replace it.
AUTO_WEIGHT = 0.8
COACH_WEIGHT = 0.2

_RAW_MIN = -8.0
_RAW_MAX = 12.0


def _round1(value: float) -> float:
    """Round half up to one decimal (python's round() is banker's rounding)."""
    return math.floor(value * 10 + 0.5) / 10


def _clamp(v: float, min_v: float, max_v: float) -> float:
    return min(max_v, max(min_v, v))


def auto_rating(stats: MatchPlayerStats | None) -> float:
    """Rating 1.0-10.0 from match stats; a player without a stats row gets the baseline."""

    def n(column: str) -> int:
        return int(getattr(stats, column, 0) or 0) if stats is not None else 0

    # Failed passes count against successful ones.
    net_passes = max(0, n("passes") - n("passes_failed"))
    positive = (
        n("goals") * 6.3
        + n("assists") * 4.2
        + n("shots_on_goal") * 2.2
        + n("shots_off_goal") * 0.9
        + net_passes * 0.115
        + n("won_duels") * 1.08
        + n("won_balls") * 0.92
        + n("penalties") * 3.0
    )
    negative = (
        n("errors") * 1.05
        + n("lost_balls") * 0.22
        + n("lost_duels") * 0.4
        + n("fouls") * 0.24
        + n("yellow_cards") * 0.85
        + n("red_cards") * 2.7
    )
    activity = (
        net_passes
        + n("won_duels")
        + n("lost_duels")
        + n("shots_on_goal")
        + n("shots_off_goal")
        + n("won_balls")
        + n("lost_balls")
    )
    activity_bonus = min(1.95, activity * 0.035)
    score = positive - negative + activity_bonus + 1.2

    norm = (score - _RAW_MIN) / (_RAW_MAX - _RAW_MIN)
    return _round1(1 + 9 * _clamp(norm, 0, 1))


def final_rating(auto: float, coach: int | float | None) -> float:
    """Auto rating, or the weighted mix with the coach's mark (valid marks are 1-10)."""
    if coach is None or not (1 <= coach <= 10):
        return auto
    return _round1(AUTO_WEIGHT * auto + COACH_WEIGHT * coach)
