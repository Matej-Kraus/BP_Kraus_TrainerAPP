"""Match lifecycle + deletion. Single place for transaction boundaries."""

from sqlalchemy.orm import Session

from app.exceptions import BadRequestError
from app.models.match import Match
from app.models.match_event import MatchEvent
from app.models.match_lineup import MatchLineup
from app.models.match_player_rating import MatchPlayerRating
from app.models.match_player_stats import MatchPlayerStats
from app.models.match_substitution import MatchSubstitution
from app.services.common import get_match_or_404
from app.util.time import utcnow


def start_match(db: Session, match_id: int, club_id: int) -> Match:
    m = get_match_or_404(db, match_id, club_id)
    if m.status != "planned":
        raise BadRequestError("Match is not in planned state")
    m.status = "live_half_1"
    m.seconds_before_live = 0
    m.live_started_at = utcnow()
    db.commit()
    db.refresh(m)
    return m


def half_time(db: Session, match_id: int, club_id: int) -> Match:
    m = get_match_or_404(db, match_id, club_id)
    if m.status != "live_half_1":
        raise BadRequestError("Match is not in first half")
    if not m.live_started_at:
        raise BadRequestError("live_started_at not set")

    now = utcnow()
    started = m.live_started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=now.tzinfo)
    elapsed = int((now - started).total_seconds())
    if elapsed < 0:
        elapsed = 0

    m.seconds_before_live += elapsed
    m.live_started_at = None
    m.status = "half_time"
    db.commit()
    db.refresh(m)
    return m


def start_second_half(db: Session, match_id: int, club_id: int) -> Match:
    m = get_match_or_404(db, match_id, club_id)
    if m.status != "half_time":
        raise BadRequestError("Match is not in half-time")
    m.status = "live_half_2"
    m.live_started_at = utcnow()
    db.commit()
    db.refresh(m)
    return m


def finish_match(db: Session, match_id: int, club_id: int) -> Match:
    m = get_match_or_404(db, match_id, club_id)
    if m.status in ("live_half_1", "live_half_2") and m.live_started_at:
        now = utcnow()
        started = m.live_started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=now.tzinfo)
        elapsed = int((now - started).total_seconds())
        if elapsed < 0:
            elapsed = 0
        m.seconds_before_live += elapsed
        m.live_started_at = None
    m.status = "finished"
    db.commit()
    db.refresh(m)
    return m


def delete_match(db: Session, match_id: int, club_id: int) -> None:
    """
    Delete a match and all dependent rows to avoid orphaned data.

    Order matters because FK cascade is not guaranteed at DB level.
    """
    m = get_match_or_404(db, match_id, club_id)

    (
        db.query(MatchEvent)
        .filter(MatchEvent.match_id == match_id)
        .delete(synchronize_session=False)
    )
    (
        db.query(MatchPlayerStats)
        .filter(MatchPlayerStats.match_id == match_id)
        .delete(synchronize_session=False)
    )
    (
        db.query(MatchPlayerRating)
        .filter(MatchPlayerRating.match_id == match_id)
        .delete(synchronize_session=False)
    )
    (
        db.query(MatchSubstitution)
        .filter(MatchSubstitution.match_id == match_id)
        .delete(synchronize_session=False)
    )
    (
        db.query(MatchLineup)
        .filter(MatchLineup.match_id == match_id)
        .delete(synchronize_session=False)
    )
    db.delete(m)
    db.commit()
