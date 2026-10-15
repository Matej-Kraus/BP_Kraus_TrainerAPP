from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.common.enums import EventType
from app.models.match import Match
from app.models.match_event import MatchEvent
from app.models.match_lineup import MatchLineup
from app.models.player import Player
from app.models.user import User
from app.schemas.event import MatchEventCreate, MatchEventOut
from app.services.stats_service import recompute_player_stats
from app.util.time import utcnow

router = APIRouter(prefix="/matches", tags=["events"])

LIVE_STATUSES = ("live_half_1", "live_half_2")


def _get_match(db: Session, match_id: int, club_id: int) -> Match:
    m = db.query(Match).filter(Match.id == match_id, Match.club_id == club_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    return m


def _out(ev: MatchEvent, email: str | None) -> MatchEventOut:
    return MatchEventOut(
        id=ev.id,
        match_id=ev.match_id,
        player_id=ev.player_id,
        event_type=ev.event_type,
        delta=ev.delta,
        half=ev.half,
        second_in_match=ev.second_in_match,
        client_event_id=ev.client_event_id,
        created_by_email=email,
    )


def _author_email(db: Session, user_id: int | None) -> str | None:
    if user_id is None:
        return None
    return db.query(User.email).filter(User.id == user_id).scalar()


def _ensure_can_edit_events(match: Match, user: User) -> None:
    """Events can be removed while the match runs; after it ended only the coach may."""
    if match.status == "planned":
        raise HTTPException(status_code=400, detail="Match has not started")
    if match.status == "finished" and user.role != "coach":
        raise HTTPException(
            status_code=403, detail="Only the coach can edit events of a finished match"
        )


def _soft_delete(db: Session, ev: MatchEvent) -> None:
    ev.deleted_at = utcnow()
    db.flush()  # session has autoflush off; stats are recomputed from the DB
    recompute_player_stats(db, ev.match_id, ev.player_id)


@router.post("/{match_id}/events", response_model=MatchEventOut)
def add_match_event(
    match_id: int,
    payload: MatchEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = _get_match(db, match_id, current_user.club_id)
    if m.status not in LIVE_STATUSES:
        raise HTTPException(status_code=400, detail="Match is not live")

    # Retries (e.g. offline queue) must not create duplicates.
    if payload.client_event_id:
        existing = (
            db.query(MatchEvent)
            .filter(
                MatchEvent.match_id == match_id,
                MatchEvent.client_event_id == payload.client_event_id,
            )
            .first()
        )
        if existing:
            return _out(existing, _author_email(db, existing.created_by_user_id))

    # Player must be in lineup (starter or sub)
    in_lineup = (
        db.query(MatchLineup.id)
        .join(Player, Player.id == MatchLineup.player_id)
        .filter(MatchLineup.match_id == match_id, MatchLineup.player_id == payload.player_id)
        .filter(Player.club_id == current_user.club_id)
        .first()
    )
    if not in_lineup:
        raise HTTPException(status_code=400, detail="Player is not in lineup for this match")

    ev = MatchEvent(
        match_id=match_id,
        player_id=payload.player_id,
        event_type=payload.event_type.value,
        delta=1,
        half=payload.half,
        second_in_match=payload.second_in_match,
        created_by_user_id=current_user.id,
        client_event_id=payload.client_event_id,
    )
    db.add(ev)
    db.flush()
    recompute_player_stats(db, match_id, payload.player_id)
    db.commit()
    db.refresh(ev)
    return _out(ev, current_user.email)


@router.get("/{match_id}/events", response_model=list[MatchEventOut])
def list_match_events(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_match(db, match_id, current_user.club_id)

    rows = (
        db.query(MatchEvent, User.email)
        .outerjoin(User, User.id == MatchEvent.created_by_user_id)
        .filter(MatchEvent.match_id == match_id, MatchEvent.deleted_at.is_(None))
        .order_by(MatchEvent.second_in_match.asc(), MatchEvent.id.asc())
        .all()
    )
    return [_out(ev, email) for ev, email in rows]


# NOTE: must be declared before "/events/{event_id}" so "last" is not parsed as an id.
@router.delete("/{match_id}/events/last", response_model=MatchEventOut)
def undo_last_event(
    match_id: int,
    player_id: int = Query(...),
    event_type: EventType = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Undo the most recently recorded event of this type for this player (the live "-" button)."""
    m = _get_match(db, match_id, current_user.club_id)
    _ensure_can_edit_events(m, current_user)

    ev = (
        db.query(MatchEvent)
        .filter(
            MatchEvent.match_id == match_id,
            MatchEvent.player_id == player_id,
            MatchEvent.event_type == event_type.value,
            MatchEvent.deleted_at.is_(None),
        )
        .order_by(MatchEvent.id.desc())
        .first()
    )
    if not ev:
        raise HTTPException(status_code=404, detail="No event to undo")
    email = _author_email(db, ev.created_by_user_id)
    _soft_delete(db, ev)
    db.commit()
    return _out(ev, email)


@router.delete("/{match_id}/events/{event_id}", status_code=204)
def delete_match_event(
    match_id: int,
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove one specific event (idempotent: deleting it again is a no-op)."""
    m = _get_match(db, match_id, current_user.club_id)
    _ensure_can_edit_events(m, current_user)

    ev = (
        db.query(MatchEvent)
        .filter(MatchEvent.id == event_id, MatchEvent.match_id == match_id)
        .first()
    )
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    if ev.deleted_at is None:
        _soft_delete(db, ev)
        db.commit()
    return Response(status_code=204)
