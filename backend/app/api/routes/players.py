import csv
import io

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_role
from app.models.match_event import MatchEvent
from app.models.match_lineup import MatchLineup
from app.models.match_player_rating import MatchPlayerRating
from app.models.match_player_stats import MatchPlayerStats
from app.models.match_substitution import MatchSubstitution
from app.models.player import Player
from app.models.season import Season
from app.models.season_player import SeasonPlayer
from app.models.user import User
from app.schemas.player import PlayerCreate, PlayerOut
from app.util.time import utcnow

router = APIRouter(prefix="/players", tags=["players"])

@router.post("", response_model=PlayerOut)
def create_player(
    payload: PlayerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    season_id = payload.season_id
    if season_id is None:
        season = (
            db.query(Season)
            .filter(Season.club_id == current_user.club_id)
            .order_by(Season.id.asc())
            .first()
        )
        if not season:
            raise HTTPException(status_code=400, detail="No season exists for this club")
        season_id = season.id
    season = (
        db.query(Season)
        .filter(Season.id == season_id, Season.club_id == current_user.club_id)
        .first()
    )
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    jersey_taken = (
        db.query(Player.id)
        .join(SeasonPlayer, SeasonPlayer.player_id == Player.id)
        .filter(
            Player.club_id == current_user.club_id,
            SeasonPlayer.season_id == season_id,
            Player.jersey_number == payload.jersey_number,
            Player.archived_at.is_(None),
        )
        .first()
    )
    if jersey_taken:
        raise HTTPException(
            status_code=409,
            detail="Jersey number already exists in selected season",
        )

    player_data = payload.model_dump()
    player_data.pop("season_id", None)
    player = Player(club_id=current_user.club_id, **player_data)
    db.add(player)
    db.flush()
    db.add(SeasonPlayer(season_id=season_id, player_id=player.id))
    db.commit()
    db.refresh(player)
    return player


@router.post("/import")
def import_players_csv(
    file: UploadFile = File(...),
    season_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    """
    Import players from CSV.

    Expected headers: first_name,last_name,jersey_number,position
    Upsert strategy (MVP): match by jersey_number within the club.
    """
    raw = file.file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded")

    reader = csv.DictReader(io.StringIO(text))
    required = {"first_name", "last_name", "jersey_number"}
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        raise HTTPException(
            status_code=400,
            detail=f"Missing required headers. Required: {sorted(required)}",
        )

    if season_id is None:
        season = (
            db.query(Season)
            .filter(Season.club_id == current_user.club_id)
            .order_by(Season.id.asc())
            .first()
        )
        if not season:
            raise HTTPException(status_code=400, detail="No season exists for this club")
        season_id = season.id
    season = (
        db.query(Season)
        .filter(Season.id == season_id, Season.club_id == current_user.club_id)
        .first()
    )
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    created = 0
    updated = 0
    assigned = 0
    errors: list[dict] = []

    for i, row in enumerate(reader, start=2):  # header is line 1
        try:
            first = (row.get("first_name") or "").strip()
            last = (row.get("last_name") or "").strip()
            jersey_raw = (row.get("jersey_number") or "").strip()
            pos = (row.get("position") or "").strip() or None

            if not first or not last or not jersey_raw:
                raise ValueError("first_name, last_name, jersey_number are required")

            jersey = int(jersey_raw)
            if jersey <= 0 or jersey > 99:
                raise ValueError("jersey_number must be in 1..99")

            existing = (
                db.query(Player)
                .filter(Player.club_id == current_user.club_id, Player.jersey_number == jersey)
                .first()
            )
            if existing:
                existing.first_name = first
                existing.last_name = last
                existing.position = pos
                updated += 1
                linked = (
                    db.query(SeasonPlayer)
                    .filter(
                        SeasonPlayer.season_id == season_id,
                        SeasonPlayer.player_id == existing.id,
                    )
                    .first()
                )
                if not linked:
                    db.add(SeasonPlayer(season_id=season_id, player_id=existing.id))
                    assigned += 1
            else:
                p = Player(
                    club_id=current_user.club_id,
                    first_name=first,
                    last_name=last,
                    jersey_number=jersey,
                    position=pos,
                )
                db.add(p)
                db.flush()
                db.add(SeasonPlayer(season_id=season_id, player_id=p.id))
                created += 1
        except Exception as e:  # noqa: BLE001 (CSV row-level error aggregation)
            errors.append({"line": i, "error": str(e), "row": row})

    db.commit()
    return {
        "ok": True,
        "created": created,
        "updated": updated,
        "assigned": assigned,
        "season_id": season_id,
        "errors": errors,
    }

@router.get("", response_model=list[PlayerOut])
def list_players(
    season_id: int | None = Query(default=None),
    include_archived: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Player).filter(Player.club_id == current_user.club_id)
    if not include_archived:
        q = q.filter(Player.archived_at.is_(None))
    if season_id is not None:
        season = (
            db.query(Season)
            .filter(Season.id == season_id, Season.club_id == current_user.club_id)
            .first()
        )
        if not season:
            raise HTTPException(status_code=404, detail="Season not found")
        q = q.join(SeasonPlayer, SeasonPlayer.player_id == Player.id).filter(
            SeasonPlayer.season_id == season_id
        )
    return q.order_by(Player.jersey_number).all()

def _get_club_player(db: Session, player_id: int, club_id: int) -> Player:
    p = db.query(Player).filter(Player.id == player_id, Player.club_id == club_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Player not found")
    return p


def player_has_match_history(db: Session, player_id: int) -> bool:
    """True when the player appears in any lineup, event, stat, rating or substitution."""
    columns = (
        MatchLineup.player_id,
        MatchEvent.player_id,
        MatchPlayerStats.player_id,
        MatchPlayerRating.player_id,
        MatchSubstitution.player_out_id,
        MatchSubstitution.player_in_id,
    )
    return any(db.query(col).filter(col == player_id).first() is not None for col in columns)


@router.delete("/{player_id}")
def delete_player(
    player_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    """Hard-delete only players without match history; otherwise archive them instead."""
    p = _get_club_player(db, player_id, current_user.club_id)
    if player_has_match_history(db, p.id):
        raise HTTPException(
            status_code=409,
            detail="Player has match history and cannot be deleted. Archive the player instead.",
        )
    db.query(SeasonPlayer).filter(SeasonPlayer.player_id == p.id).delete()
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.post("/{player_id}/archive", response_model=PlayerOut)
def archive_player(
    player_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    p = _get_club_player(db, player_id, current_user.club_id)
    if p.archived_at is None:
        p.archived_at = utcnow()
        db.commit()
        db.refresh(p)
    return p


@router.post("/{player_id}/unarchive", response_model=PlayerOut)
def unarchive_player(
    player_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    p = _get_club_player(db, player_id, current_user.club_id)
    if p.archived_at is not None:
        p.archived_at = None
        db.commit()
        db.refresh(p)
    return p
