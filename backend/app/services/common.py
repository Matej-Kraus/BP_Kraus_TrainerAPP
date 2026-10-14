"""Helpers shared by the service layer."""

from sqlalchemy.orm import Session

from app.exceptions import NotFoundError
from app.models.match import Match


def get_match_for_club(db: Session, match_id: int, club_id: int) -> Match | None:
    return (
        db.query(Match)
        .filter(Match.id == match_id, Match.club_id == club_id)
        .first()
    )


def get_match_or_404(db: Session, match_id: int, club_id: int) -> Match:
    m = get_match_for_club(db, match_id, club_id)
    if not m:
        raise NotFoundError("Match not found")
    return m
