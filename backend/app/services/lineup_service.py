"""Lineup save: validation and replace. Single transaction boundary."""

from sqlalchemy.orm import Session

from app.exceptions import BadRequestError
from app.models.match_lineup import MatchLineup
from app.models.player import Player
from app.models.season_player import SeasonPlayer
from app.schemas.lineup import LineupSaveRequest
from app.services.common import get_match_or_404


def save_lineup(
    db: Session,
    match_id: int,
    club_id: int,
    payload: LineupSaveRequest,
) -> dict:
    m = get_match_or_404(db, match_id, club_id)

    seen_players: set[int] = set()
    seen_numbers: set[int] = set()
    starters = 0
    subs = 0

    for item in payload.items:
        if item.player_id in seen_players:
            raise BadRequestError("Duplicate player in lineup")
        seen_players.add(item.player_id)
        if item.jersey_number_match in seen_numbers:
            raise BadRequestError("Duplicate jersey_number_match in lineup")
        seen_numbers.add(item.jersey_number_match)
        if item.role == "starter":
            starters += 1
        else:
            subs += 1

    if starters > 11:
        raise BadRequestError("Too many starters (max 11)")
    if subs > 5:
        raise BadRequestError("Too many subs (max 5)")

    ids = [i.player_id for i in payload.items]
    if ids:
        existing = (
            db.query(Player.id)
            .filter(Player.club_id == club_id, Player.id.in_(ids))
            .all()
        )
        existing_ids = {x[0] for x in existing}
        missing = [pid for pid in ids if pid not in existing_ids]
        if missing:
            raise BadRequestError(f"Players not found: {missing}")

        season_allowed = (
            db.query(SeasonPlayer.player_id)
            .filter(SeasonPlayer.season_id == m.season_id, SeasonPlayer.player_id.in_(ids))
            .all()
        )
        allowed_ids = {x[0] for x in season_allowed}
        out_of_season = [pid for pid in ids if pid not in allowed_ids]
        if out_of_season:
            raise BadRequestError(
                f"Players are not assigned to this season: {out_of_season}"
            )

    db.query(MatchLineup).filter(MatchLineup.match_id == match_id).delete()
    for item in payload.items:
        db.add(
            MatchLineup(
                match_id=match_id,
                player_id=item.player_id,
                jersey_number_match=item.jersey_number_match,
                role=item.role,
            )
        )
    db.commit()
    return {"ok": True, "match_id": match_id, "starters": starters, "subs": subs}
