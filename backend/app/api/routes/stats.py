from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import asc
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.common.stats import row_to_stats, zero_stats
from app.models.match import Match
from app.models.match_lineup import MatchLineup
from app.models.match_player_stats import MatchPlayerStats
from app.models.player import Player
from app.models.user import User
from app.schemas.stats import MatchPlayerStatsOut

router = APIRouter(prefix="/matches", tags=["stats"])


@router.get("/{match_id}/stats", response_model=list[MatchPlayerStatsOut])
def get_match_stats(
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

    return (
        db.query(MatchPlayerStats)
        .filter(MatchPlayerStats.match_id == match_id)
        .order_by(MatchPlayerStats.player_id.asc())
        .all()
    )


@router.get("/{match_id}/roster-with-stats")
def get_roster_with_stats(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns nominated players (starter/sub), sorted by jersey number for match,
    and attaches their aggregated match stats (default zeros if no stats yet).
    """
    m = (
        db.query(Match)
        .filter(Match.id == match_id, Match.club_id == current_user.club_id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")

    rows = (
        db.query(MatchLineup, Player, MatchPlayerStats)
        .join(Player, Player.id == MatchLineup.player_id)
        .outerjoin(
            MatchPlayerStats,
            (MatchPlayerStats.match_id == MatchLineup.match_id)
            & (MatchPlayerStats.player_id == MatchLineup.player_id),
        )
        .filter(MatchLineup.match_id == match_id, Player.club_id == current_user.club_id)
        .order_by(asc(MatchLineup.jersey_number_match))
        .all()
    )

    def stats_dict(s: MatchPlayerStats | None) -> dict:
        # pokud ještě hráč nemá žádný event, tak stats řádek neexistuje => vrať nuly
        return zero_stats() if s is None else row_to_stats(s)

    return [
        {
            "player_id": p.id,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "role": lu.role,
            "jersey_number_match": lu.jersey_number_match,
            "stats": stats_dict(s),
        }
        for (lu, p, s) in rows
    ]
