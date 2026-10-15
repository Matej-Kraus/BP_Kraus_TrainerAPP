import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_role
from app.common.stats import STAT_COLUMNS, row_to_stats, stat_sum_columns
from app.models.match import Match
from app.models.match_event import MatchEvent
from app.models.match_lineup import MatchLineup
from app.models.match_player_stats import MatchPlayerStats
from app.models.player import Player
from app.models.season import Season
from app.models.user import User

router = APIRouter(prefix="/export", tags=["export"])


def _csv_response(filename: str, content: str) -> Response:
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/players.csv")
def export_players_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    players = (
        db.query(Player)
        .filter(Player.club_id == current_user.club_id)
        .order_by(Player.jersey_number.asc())
        .all()
    )

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "first_name", "last_name", "jersey_number", "position"])
    for p in players:
        w.writerow([p.id, p.first_name, p.last_name, p.jersey_number, p.position or ""])
    return _csv_response("players.csv", buf.getvalue())


@router.get("/matches/{match_id}/events.csv")
def export_match_events_csv(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    match = (
        db.query(Match)
        .filter(Match.id == match_id, Match.club_id == current_user.club_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    rows = (
        db.query(MatchEvent, Player, MatchLineup)
        .join(Player, Player.id == MatchEvent.player_id)
        .outerjoin(
            MatchLineup,
            (MatchLineup.match_id == MatchEvent.match_id)
            & (MatchLineup.player_id == MatchEvent.player_id),
        )
        .filter(
            MatchEvent.match_id == match_id,
            MatchEvent.deleted_at.is_(None),
            Player.club_id == current_user.club_id,
        )
        .order_by(MatchEvent.second_in_match.asc(), MatchEvent.id.asc())
        .all()
    )

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "event_id",
            "match_id",
            "half",
            "second_in_match",
            "event_type",
            "delta",
            "player_id",
            "player_name",
            "jersey_number_default",
            "jersey_number_match",
        ]
    )
    for (ev, p, lu) in rows:
        w.writerow(
            [
                ev.id,
                ev.match_id,
                ev.half,
                ev.second_in_match,
                ev.event_type,
                ev.delta,
                p.id,
                f"{p.first_name} {p.last_name}",
                p.jersey_number,
                (lu.jersey_number_match if lu else ""),
            ]
        )

    return _csv_response(f"match_{match_id}_events.csv", buf.getvalue())


@router.get("/seasons/{season_id}/team_stats.csv")
def export_team_stats_csv(
    season_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    season = (
        db.query(Season)
        .filter(Season.id == season_id, Season.club_id == current_user.club_id)
        .first()
    )
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    q = (
        db.query(
            *stat_sum_columns(),
        )
        .join(Match, Match.id == MatchPlayerStats.match_id)
        .filter(Match.season_id == season_id, Match.club_id == current_user.club_id)
    )
    row = q.one()

    totals = row_to_stats(row)

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["season_id", "season_name", *STAT_COLUMNS])
    w.writerow([season.id, season.name, *(totals[c] for c in STAT_COLUMNS)])

    return _csv_response(f"season_{season_id}_team_stats.csv", buf.getvalue())

