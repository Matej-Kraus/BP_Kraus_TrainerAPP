"""Save coach ratings for a finished match. Single transaction boundary."""

from sqlalchemy.orm import Session

from app.exceptions import BadRequestError
from app.models.match_lineup import MatchLineup
from app.models.match_player_rating import MatchPlayerRating
from app.models.player import Player
from app.models.user import User
from app.schemas.rating import RatingsSaveRequest
from app.services.common import get_match_or_404


def save_ratings(
    db: Session,
    match_id: int,
    current_user: User,
    payload: RatingsSaveRequest,
) -> list[MatchPlayerRating]:
    m = get_match_or_404(db, match_id, current_user.club_id)
    if m.status != "finished":
        raise BadRequestError("Ratings can only be saved after the match is finished")

    nominated_ids = {
        pid
        for (pid,) in (
            db.query(MatchLineup.player_id)
            .join(Player, Player.id == MatchLineup.player_id)
            .filter(
                MatchLineup.match_id == match_id,
                Player.club_id == current_user.club_id,
            )
            .all()
        )
    }
    missing = [i.player_id for i in payload.items if i.player_id not in nominated_ids]
    if missing:
        raise BadRequestError(f"Players not in lineup: {missing}")

    db.query(MatchPlayerRating).filter(MatchPlayerRating.match_id == match_id).delete()
    rows: list[MatchPlayerRating] = []
    for item in payload.items:
        r = MatchPlayerRating(
            match_id=match_id,
            player_id=item.player_id,
            user_id=current_user.id,
            rating=item.rating,
            note=item.note,
        )
        db.add(r)
        rows.append(r)
    db.commit()
    for r in rows:
        db.refresh(r)
    return rows
