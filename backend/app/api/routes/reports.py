from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, case, desc, distinct, func

from app.api.deps import get_current_user, get_db
from app.common.stats import row_to_stats, stat_sum_columns, zero_stats
from app.models.match_event import MatchEvent
from app.models.match import Match
from app.models.player import Player
from app.models.season import Season
from app.models.match_player_stats import MatchPlayerStats
from app.models.user import User
from app.schemas.report import StatsSumOut, TeamSeasonStatsOut

router = APIRouter(tags=["reports"])


def _sum_stats(q) -> StatsSumOut:
    row = q.one()
    # SUM returns NULL when there are no rows -> row_to_stats converts to 0
    return StatsSumOut(games=int(row.games or 0), **row_to_stats(row))


@router.get("/players/{player_id}/stats/season/{season_id}", response_model=StatsSumOut)
def player_stats_season(
    player_id: int,
    season_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    player = (
        db.query(Player)
        .filter(Player.id == player_id, Player.club_id == current_user.club_id)
        .first()
    )
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    season = (
        db.query(Season)
        .filter(Season.id == season_id, Season.club_id == current_user.club_id)
        .first()
    )
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    q = (
        db.query(
            func.count(MatchPlayerStats.id).label("games"),
            *stat_sum_columns(),
        )
        .join(Match, Match.id == MatchPlayerStats.match_id)
        .filter(
            MatchPlayerStats.player_id == player_id,
            Match.season_id == season_id,
            Match.club_id == current_user.club_id,
        )
    )
    return _sum_stats(q)


@router.get("/players/{player_id}/stats/last/{n}", response_model=StatsSumOut)
def player_stats_last_n(
    player_id: int,
    n: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if n <= 0 or n > 200:
        raise HTTPException(status_code=400, detail="n must be between 1 and 200")
    player = (
        db.query(Player)
        .filter(Player.id == player_id, Player.club_id == current_user.club_id)
        .first()
    )
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    # nejdřív vyber posledních N match_id kde hráč má stats
    last_match_ids = (
        db.query(MatchPlayerStats.match_id)
        .join(Match, Match.id == MatchPlayerStats.match_id)
        .filter(MatchPlayerStats.player_id == player_id, Match.club_id == current_user.club_id)
        .order_by(desc(Match.match_date), desc(Match.id))
        .limit(n)
        .all()
    )
    match_ids = [x[0] for x in last_match_ids]
    if not match_ids:
        # žádné zápasy -> nuly
        return StatsSumOut(games=0, **zero_stats())

    q = (
        db.query(
            func.count(MatchPlayerStats.id).label("games"),
            *stat_sum_columns(),
        )
        .filter(
            MatchPlayerStats.player_id == player_id,
            MatchPlayerStats.match_id.in_(match_ids),
        )
    )
    return _sum_stats(q)


@router.get("/seasons/{season_id}/team-stats", response_model=TeamSeasonStatsOut)
def team_stats_season(
    season_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    season = (
        db.query(Season)
        .filter(Season.id == season_id, Season.club_id == current_user.club_id)
        .first()
    )
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    season_matches_total = (
        db.query(func.count(Match.id))
        .filter(
            Match.season_id == season_id,
            Match.club_id == current_user.club_id,
        )
        .scalar()
        or 0
    )

    # `games` = number of distinct matches with stat rows (NOT sum over players).
    q = (
        db.query(
            func.count(distinct(MatchPlayerStats.match_id)).label("games"),
            *stat_sum_columns(),
        )
        .join(Match, Match.id == MatchPlayerStats.match_id)
        .filter(Match.season_id == season_id, Match.club_id == current_user.club_id)
    )
    row = q.one()

    def z(x):
        return int(x or 0)

    p_plus = func.sum(
        case(
            (and_(MatchEvent.event_type == "pass", MatchEvent.delta == 1), 1),
            else_=0,
        )
    )
    p_minus = func.sum(
        case(
            (and_(MatchEvent.event_type == "pass", MatchEvent.delta == -1), 1),
            else_=0,
        )
    )
    pass_row = (
        db.query(p_plus.label("passes_success"), p_minus.label("passes_unsuccess"))
        .join(Match, Match.id == MatchEvent.match_id)
        .filter(
            Match.season_id == season_id,
            Match.club_id == current_user.club_id,
        )
        .one()
    )

    return TeamSeasonStatsOut(
        games=int(row.games or 0),
        season_matches_total=int(season_matches_total),
        **row_to_stats(row),
        passes_success=int(pass_row.passes_success or 0),
        passes_unsuccess=int(pass_row.passes_unsuccess or 0),
    )
