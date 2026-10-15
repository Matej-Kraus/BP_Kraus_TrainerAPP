from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_role
from app.models.match import Match
from app.models.match_player_rating import MatchPlayerRating
from app.models.user import User
from app.schemas.rating import RatingOut, RatingsSaveRequest
from app.services.ratings_service import save_ratings as ratings_save

router = APIRouter(prefix="/matches", tags=["ratings"])


@router.get("/{match_id}/ratings", response_model=list[RatingOut])
def list_ratings(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    match = (
        db.query(Match)
        .filter(Match.id == match_id, Match.club_id == current_user.club_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    return (
        db.query(MatchPlayerRating)
        .filter(MatchPlayerRating.match_id == match_id)
        .order_by(MatchPlayerRating.player_id.asc())
        .all()
    )


@router.put("/{match_id}/ratings", response_model=list[RatingOut])
def save_ratings(
    match_id: int,
    payload: RatingsSaveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    return ratings_save(db, match_id, current_user, payload)

