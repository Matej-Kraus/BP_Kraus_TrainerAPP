from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, aliased

from app.api.deps import get_current_user, get_db
from app.models.match import Match
from app.models.match_lineup import MatchLineup
from app.models.match_substitution import MatchSubstitution
from app.models.player import Player
from app.models.user import User
from app.schemas.substitution import SubstitutionCreate, SubstitutionOut

router = APIRouter(prefix="/matches", tags=["substitutions"])


def _ensure_match_live(match: Match) -> None:
    if match.status not in ("live_half_1", "live_half_2"):
        raise HTTPException(status_code=400, detail="Match is not live")


def _compute_on_field(
    db: Session, match_id: int, club_id: int
) -> tuple[set[int], set[int]]:
    """Return (on_field_ids, bench_ids) based on lineup + substitutions."""
    lineup_rows = (
        db.query(MatchLineup, Player)
        .join(Player, Player.id == MatchLineup.player_id)
        .filter(MatchLineup.match_id == match_id, Player.club_id == club_id)
        .all()
    )
    starters = {lu.player_id for lu, _ in lineup_rows if lu.role == "starter"}
    bench = {lu.player_id for lu, _ in lineup_rows if lu.role == "sub"}

    subs = (
        db.query(MatchSubstitution)
        .filter(MatchSubstitution.match_id == match_id)
        .order_by(MatchSubstitution.id.asc())
        .all()
    )

    on_field = set(starters)
    for s in subs:
        if s.player_out_id in on_field:
            on_field.remove(s.player_out_id)
        on_field.add(s.player_in_id)
        bench.discard(s.player_in_id)

    return on_field, bench


@router.post("/{match_id}/substitutions", response_model=SubstitutionOut)
def create_substitution(
    match_id: int,
    payload: SubstitutionCreate,
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
    _ensure_match_live(m)

    on_field, bench = _compute_on_field(db, match_id, current_user.club_id)

    if payload.player_out_id not in on_field:
        raise HTTPException(status_code=400, detail="Player_out is not currently on field")
    if payload.player_in_id not in bench:
        raise HTTPException(status_code=400, detail="Player_in is not available on bench")

    s = MatchSubstitution(
        match_id=match_id,
        player_out_id=payload.player_out_id,
        player_in_id=payload.player_in_id,
        half=payload.half,
        second_in_match=payload.second_in_match,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.get("/{match_id}/substitutions")
def list_substitutions(
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

    out_player = aliased(Player)
    in_player = aliased(Player)
    rows = (
        db.query(MatchSubstitution, out_player, in_player)
        .join(out_player, out_player.id == MatchSubstitution.player_out_id)
        .join(in_player, in_player.id == MatchSubstitution.player_in_id)
        .filter(MatchSubstitution.match_id == match_id)
        .order_by(MatchSubstitution.second_in_match.asc(), MatchSubstitution.id.asc())
        .all()
    )

    result = []
    for s, out_p, in_p in rows:
        result.append(
            {
                "id": s.id,
                "match_id": s.match_id,
                "player_out_id": s.player_out_id,
                "player_out_name": f"{out_p.first_name} {out_p.last_name}",
                "player_in_id": s.player_in_id,
                "player_in_name": f"{in_p.first_name} {in_p.last_name}",
                "half": s.half,
                "second_in_match": s.second_in_match,
            }
        )
    return result

