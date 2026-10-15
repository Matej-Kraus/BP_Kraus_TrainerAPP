from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import asc
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_role
from app.models.match import Match
from app.models.match_lineup import MatchLineup
from app.models.player import Player
from app.models.season_player import SeasonPlayer
from app.models.user import User
from app.schemas.lineup import LineupEditorPlayer, LineupEditorResponse, LineupSaveRequest
from app.services.lineup_service import save_lineup as lineup_save

router = APIRouter(prefix="/matches", tags=["lineup"])


@router.get("/{match_id}/lineup-editor", response_model=LineupEditorResponse)
def get_lineup_editor(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = (
        db.query(Match)
        .filter(Match.id == match_id, Match.club_id == current_user.club_id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")

    players = (
        db.query(Player)
        .join(SeasonPlayer, SeasonPlayer.player_id == Player.id)
        .filter(Player.club_id == current_user.club_id)
        .filter(SeasonPlayer.season_id == m.season_id)
        .order_by(Player.jersey_number)
        .all()
    )
    lineup_rows = db.query(MatchLineup).filter(MatchLineup.match_id == match_id).all()
    nominated_ids = {r.player_id for r in lineup_rows}
    players = [p for p in players if p.archived_at is None or p.id in nominated_ids]

    lineup_by_player = {r.player_id: r for r in lineup_rows}
    taken_numbers = sorted([r.jersey_number_match for r in lineup_rows])

    resp_players: list[LineupEditorPlayer] = []
    for p in players:
        lr = lineup_by_player.get(p.id)
        if lr:
            role = lr.role
            jersey = lr.jersey_number_match
        else:
            role = "out"
            jersey = None

        resp_players.append(
            LineupEditorPlayer(
                player_id=p.id,
                first_name=p.first_name,
                last_name=p.last_name,
                default_jersey_number=p.jersey_number,
                role=role,
                jersey_number_match=jersey,
            )
        )

    return LineupEditorResponse(
        match_id=match_id,
        taken_numbers=taken_numbers,
        players=resp_players,
    )


@router.put("/{match_id}/lineup")
def save_lineup(
    match_id: int,
    payload: LineupSaveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    return lineup_save(db, match_id, current_user.club_id, payload)


@router.get("/{match_id}/roster")
def get_roster(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns only nominated players (starter/sub), sorted by jersey number for match.
    Perfect for live match UI.
    """
    m = (
        db.query(Match)
        .filter(Match.id == match_id, Match.club_id == current_user.club_id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")

    rows = (
        db.query(MatchLineup, Player)
        .join(Player, Player.id == MatchLineup.player_id)
        .filter(MatchLineup.match_id == match_id, Player.club_id == current_user.club_id)
        .order_by(asc(MatchLineup.jersey_number_match))
        .all()
    )

    return [
        {
            "player_id": p.id,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "jersey_number_match": lu.jersey_number_match,
            "role": lu.role,
        }
        for (lu, p) in rows
    ]
