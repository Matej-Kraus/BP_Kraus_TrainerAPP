from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_role
from app.models.match import Match
from app.models.match_lineup import MatchLineup
from app.models.player import Player
from app.models.season import Season
from app.models.season_player import SeasonPlayer
from app.models.user import User
from app.schemas.season import SeasonCreate, SeasonOut

router = APIRouter(prefix="/seasons", tags=["seasons"])

@router.post("", response_model=SeasonOut)
def create_season(
    payload: SeasonCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    existing = (
        db.query(Season)
        .filter(Season.club_id == current_user.club_id, Season.name == payload.name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Season already exists")
    s = Season(club_id=current_user.club_id, name=payload.name)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s

@router.get("", response_model=list[SeasonOut])
def list_seasons(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(Season)
        .filter(Season.club_id == current_user.club_id)
        .order_by(Season.id.desc())
        .all()
    )


@router.delete("/{season_id}/players/{player_id}")
def remove_player_from_season(
    season_id: int,
    player_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    """Remove a player from a season's roster (the player itself is kept)."""
    link = (
        db.query(SeasonPlayer)
        .join(Season, Season.id == SeasonPlayer.season_id)
        .join(Player, Player.id == SeasonPlayer.player_id)
        .filter(
            SeasonPlayer.season_id == season_id,
            SeasonPlayer.player_id == player_id,
            Season.club_id == current_user.club_id,
            Player.club_id == current_user.club_id,
        )
        .first()
    )
    if not link:
        raise HTTPException(status_code=404, detail="Player is not in this season")

    nominated = (
        db.query(MatchLineup.id)
        .join(Match, Match.id == MatchLineup.match_id)
        .filter(Match.season_id == season_id, MatchLineup.player_id == player_id)
        .first()
    )
    if nominated:
        raise HTTPException(
            status_code=409,
            detail="Player is in a lineup of this season's matches. Archive the player instead.",
        )
    db.delete(link)
    db.commit()
    return {"ok": True}
