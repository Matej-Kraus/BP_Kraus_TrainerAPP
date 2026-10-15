from sqlalchemy.orm import Session

from app.models.match_player_stats import MatchPlayerStats

EVENT_TO_COLUMN = {
    "goal": "goals",
    "assist": "assists",
    "error": "errors",
    "won_ball": "won_balls",
    "lost_ball": "lost_balls",
    "foul": "fouls",
    "pass": "passes",
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


def apply_event_to_match_stats(db: Session, match_id: int, player_id: int, event_type: str, delta: int) -> MatchPlayerStats:
    col = EVENT_TO_COLUMN.get(event_type)
    if not col:
        # když bys někdy přidal nový event a zapomněl mapování
        raise ValueError(f"Unsupported event_type for stats aggregation: {event_type}")

    row = get_or_create_match_stats(db, match_id, player_id)

    current = getattr(row, col)
    new_value = current + delta

    # nechceme jít do minusu (typicky u UI - kliknutí)
    if new_value < 0:
        new_value = 0

    setattr(row, col, new_value)
    return row
