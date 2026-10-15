import random
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_role
from app.models.match import Match
from app.models.player import Player
from app.models.season import Season
from app.models.season_player import SeasonPlayer
from app.models.user import User
from app.schemas.match import MatchCreate, MatchOut, SeasonGenerationOut, SeasonGenerationRequest
from app.scripts.sim_match_core_v2 import (
    build_player_position_map,
    create_substitutions,
    ensure_lineup,
    generate_events,
    plan_substitutions,
    sample_match_profile,
)
from app.services.common import get_match_or_404
from app.services.match_service import (
    delete_match,
    finish_match,
    half_time,
    start_match,
    start_second_half,
)
from app.util.time import utcnow

router = APIRouter(prefix="/matches", tags=["matches"])


def _hard_delete_match_data(db: Session, match_id: int) -> None:
    # Use explicit SQL deletes to be resilient across legacy PostgreSQL schemas.
    db.execute(text("DELETE FROM match_events WHERE match_id = :mid"), {"mid": match_id})
    db.execute(text("DELETE FROM match_player_stats WHERE match_id = :mid"), {"mid": match_id})
    db.execute(text("DELETE FROM match_player_ratings WHERE match_id = :mid"), {"mid": match_id})
    db.execute(text("DELETE FROM match_substitutions WHERE match_id = :mid"), {"mid": match_id})
    db.execute(text("DELETE FROM match_lineups WHERE match_id = :mid"), {"mid": match_id})
    db.execute(text("DELETE FROM matches WHERE id = :mid"), {"mid": match_id})


@router.post("", response_model=MatchOut)
def create_match(
    payload: MatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    season = (
        db.query(Season)
        .filter(Season.id == payload.season_id, Season.club_id == current_user.club_id)
        .first()
    )
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    m = Match(
        club_id=current_user.club_id,
        season_id=payload.season_id,
        opponent=payload.opponent,
        competition=payload.competition,
        match_date=payload.match_date,
        status="planned",
        seconds_before_live=0,
        live_started_at=None,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.get("", response_model=list[MatchOut])
def list_matches(
    season_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Match).filter(Match.club_id == current_user.club_id)
    if season_id is not None:
        q = q.filter(Match.season_id == season_id)
    return q.order_by(Match.match_date.desc()).all()


@router.get("/{match_id}", response_model=MatchOut)
def get_match(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = get_match_or_404(db, match_id, current_user.club_id)
    return m


@router.post("/{match_id}/start", response_model=MatchOut)
def start_match_route(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    return start_match(db, match_id, current_user.club_id)


@router.post("/{match_id}/half-time", response_model=MatchOut)
def half_time_route(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    return half_time(db, match_id, current_user.club_id)


@router.post("/{match_id}/start-second-half", response_model=MatchOut)
def start_second_half_route(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    return start_second_half(db, match_id, current_user.club_id)


@router.post("/{match_id}/finish", response_model=MatchOut)
def finish_match_route(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    return finish_match(db, match_id, current_user.club_id)


@router.delete("/{match_id}", status_code=204)
def delete_match_route(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    delete_match(db, match_id, current_user.club_id)


@router.post("/generate-season-demo/run", response_model=SeasonGenerationOut)
def generate_season_demo_route(
    payload: SeasonGenerationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    if payload.max_events < payload.min_events:
        raise HTTPException(status_code=400, detail="max_events must be >= min_events")

    season = (
        db.query(Season)
        .filter(Season.id == payload.season_id, Season.club_id == current_user.club_id)
        .first()
    )
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    season_player_count = (
        db.query(SeasonPlayer)
        .join(Player, Player.id == SeasonPlayer.player_id)
        .filter(SeasonPlayer.season_id == season.id, Player.club_id == current_user.club_id)
        .count()
    )
    if season_player_count < 12:
        club_players = (
            db.query(Player)
            .filter(Player.club_id == current_user.club_id)
            .order_by(Player.jersey_number.asc())
            .all()
        )
        for p in club_players:
            exists = (
                db.query(SeasonPlayer)
                .filter(SeasonPlayer.season_id == season.id, SeasonPlayer.player_id == p.id)
                .first()
            )
            if not exists:
                db.add(SeasonPlayer(season_id=season.id, player_id=p.id))
        db.commit()

    rng = random.Random(payload.seed)
    opponents = [
        "Sparta",
        "Slavia",
        "Plzen",
        "Liberec",
        "Olomouc",
        "Bohemians",
        "Jablonec",
        "Boleslav",
        "Brno",
        "Pardubice",
        "Teplice",
        "Hradec",
        "Karvina",
        "Zlin",
        "Opava",
        "Dukla",
        "Banik",
        "Sigma",
        "Viktoria",
        "Slovan",
    ]
    competitions = ["Liga", "Pohar", "Pratelsky zapas"]

    try:
        deleted = 0
        if payload.replace_existing:
            rows = (
                db.query(Match)
                .filter(Match.club_id == current_user.club_id, Match.season_id == season.id)
                .order_by(Match.id.asc())
                .all()
            )
            for m in rows:
                _hard_delete_match_data(db, m.id)
            db.commit()
            deleted = len(rows)

        start_date = utcnow() - timedelta(days=payload.matches * 7)
        created_ids: list[int] = []

        for i in range(payload.matches):
            m = Match(
                club_id=current_user.club_id,
                season_id=season.id,
                opponent=opponents[i % len(opponents)],
                competition=rng.choice(competitions),
                match_date=start_date + timedelta(days=7 * i, hours=rng.randint(0, 3)),
                status="planned",
                seconds_before_live=0,
                live_started_at=None,
            )
            db.add(m)
            db.commit()
            db.refresh(m)

            lineup_rows = ensure_lineup(db, m, current_user.club_id)
            starters = [lu.player_id for lu in lineup_rows if lu.role == "starter"]
            bench = [lu.player_id for lu in lineup_rows if lu.role == "sub"]
            player_positions = build_player_position_map(db, starters + bench)
            match_profile = sample_match_profile(rng)
            plans = plan_substitutions(
                starters=starters,
                bench=bench,
                rng=rng,
                min_subs=2,
                max_subs=5,
                player_positions=player_positions,
                match_profile=match_profile,
            )
            create_substitutions(db, m, plans)

            generate_events(
                db,
                match=m,
                lineup_rows=lineup_rows,
                plans=plans,
                total_events=rng.randint(payload.min_events, payload.max_events),
                rng=rng,
                player_positions=player_positions,
                match_profile=match_profile,
            )
            created_ids.append(m.id)

        return SeasonGenerationOut(
            season_id=season.id,
            deleted_old_matches=deleted,
            generated_matches=len(created_ids),
            first_match_id=created_ids[0] if created_ids else None,
            last_match_id=created_ids[-1] if created_ids else None,
        )
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"generation_failed: {exc}")
