from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.orm import Session

from alembic import command
from app.db.database import SessionLocal, engine
from app.models.club import Club
from app.models.match import Match
from app.models.match_lineup import MatchLineup
from app.models.player import Player
from app.models.season import Season
from app.models.season_player import SeasonPlayer
from app.models.user import User
from app.security.passwords import hash_password


def reset_db() -> None:
    """
    Development seed reset.

    SQLite: deletes the DB file. PostgreSQL: drops and recreates the public schema
    (only with TRAINERAPP_ALLOW_DB_RESET=true). Schema is then rebuilt via Alembic.
    """
    backend_root = Path(__file__).resolve().parents[2]  # backend/

    if os.getenv("TRAINERAPP_ENV", "").lower() == "production":
        raise RuntimeError("Refusing to reset the database when TRAINERAPP_ENV=production")

    url = engine.url
    # Ensure no open connections keep the DB locked (important for test resets)
    engine.dispose()

    if url.get_backend_name() == "sqlite":
        db_path = Path(url.database or "app.db")
        if not db_path.is_absolute():
            db_path = (backend_root / db_path).resolve()
        for suffix in ("", "-wal", "-shm"):
            p = Path(str(db_path) + suffix)
            if p.exists():
                p.unlink()
    elif url.get_backend_name() == "postgresql":
        if os.getenv("TRAINERAPP_ALLOW_DB_RESET", "").lower() not in ("1", "true", "yes"):
            raise RuntimeError(
                "Refusing to drop the PostgreSQL schema. "
                "Set TRAINERAPP_ALLOW_DB_RESET=true if this is a disposable database."
            )
        with engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))
        engine.dispose()
    else:
        raise RuntimeError(f"seed.py does not support the {url.get_backend_name()} backend")

    cfg = Config(str(backend_root / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", url.render_as_string(hide_password=False))
    command.upgrade(cfg, "head")


def seed_club_and_users(db: Session) -> Club:
    club = Club(name="Demo Club")
    db.add(club)
    db.commit()
    db.refresh(club)

    coach = User(
        club_id=club.id,
        email="coach@demo.local",
        password_hash=hash_password("coach"),
        role="coach",
        email_verified=True,
        email_verification_token=None,
    )
    db.add(coach)
    assistant = User(
        club_id=club.id,
        email="assistant@demo.local",
        password_hash=hash_password("assistant"),
        role="assistant",
        email_verified=True,
        email_verification_token=None,
    )
    db.add(assistant)
    db.commit()
    return club


def seed_players(db: Session, club: Club) -> list[Player]:
    players_data = [
        ("Jan", "Novák", 1, "GK"),
        ("Petr", "Svoboda", 2, "DF"),
        ("Tomáš", "Dvořák", 3, "DF"),
        ("Lukáš", "Procházka", 4, "DF"),
        ("Martin", "Černý", 5, "DF"),
        ("David", "Kučera", 6, "MF"),
        ("Adam", "Veselý", 7, "MF"),
        ("Jakub", "Horák", 8, "MF"),
        ("Matěj", "Němec", 9, "FW"),
        ("Ondřej", "Král", 10, "FW"),
        ("Filip", "Pokorný", 11, "FW"),
        ("Michal", "Beneš", 12, "MF"),
        ("Vojtěch", "Fiala", 13, "DF"),
        ("Daniel", "Růžička", 14, "MF"),
        ("Šimon", "Konečný", 15, "FW"),
    ]

    players: list[Player] = []
    for first_name, last_name, jersey_number, position in players_data:
        p = Player(
            club_id=club.id,
            first_name=first_name,
            last_name=last_name,
            jersey_number=jersey_number,
            position=position,
        )
        db.add(p)
        players.append(p)

    db.commit()
    for p in players:
        db.refresh(p)
    return players


def seed_season_and_match(db: Session, club: Club) -> tuple[Season, Match]:
    season = Season(club_id=club.id, name="2025/2026")
    db.add(season)
    db.commit()
    db.refresh(season)

    match = Match(
        club_id=club.id,
        season_id=season.id,
        opponent="Sparta",
        competition="Liga",
        match_date=datetime(2026, 2, 23, 18, 0, 0),
        status="planned",
    )
    db.add(match)
    db.commit()
    db.refresh(match)

    return season, match


def assign_players_to_season(db: Session, season: Season, players: list[Player]) -> None:
    for p in players:
        db.add(SeasonPlayer(season_id=season.id, player_id=p.id))
    db.commit()


def seed_lineup(db: Session, match: Match, players: list[Player]) -> None:
    # 11 starterů: hráči 1..11 (dresy necháme stejné jako default)
    starters = players[:11]
    subs = players[11:15]  # 4 náhradníci (můžeš změnit na 5)

    # Ukázka změny čísla pro zápas:
    # třeba hráč s default 12 bude mít v zápase 18
    jersey_override = {12: 18}

    for p in starters:
        db.add(
            MatchLineup(
                match_id=match.id,
                player_id=p.id,
                jersey_number_match=jersey_override.get(p.jersey_number, p.jersey_number),
                role="starter",
            )
        )

    for p in subs:
        db.add(
            MatchLineup(
                match_id=match.id,
                player_id=p.id,
                jersey_number_match=jersey_override.get(p.jersey_number, p.jersey_number),
                role="sub",
            )
        )

    db.commit()


def main() -> None:
    reset_db()

    db = SessionLocal()
    try:
        club = seed_club_and_users(db)
        players = seed_players(db, club)
        season, match = seed_season_and_match(db, club)
        assign_players_to_season(db, season, players)
        seed_lineup(db, match, players)

        print("✅ Seed hotový")
        print(f"Club:   {club.id} ({club.name})")
        print("Auth:")
        print("  coach@demo.local / coach")
        print("  assistant@demo.local / assistant")
        print(f"Season: {season.id} ({season.name})")
        print(f"Match:  {match.id} vs {match.opponent} ({match.status})")
        print("Players:", len(players))
        print("Tip: otevři /docs a zkus GET /matches/{id}/lineup-editor")
    finally:
        db.close()


if __name__ == "__main__":
    main()
