"""Migration f1b2c3d4e5f6 converts legacy '-' events (pass -1 = failed pass, other -1 = correction)."""

from pathlib import Path

from alembic.config import Config
from sqlalchemy import text

from alembic import command
from app.db.database import engine

from .conftest import client  # noqa: F401  (fixture: freshly seeded database at head)

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
BEFORE_EVENTS_V2 = "f1a1c2d3e4f5"


def test_legacy_events_are_converted(client):  # noqa: F811
    cfg = Config(str(ALEMBIC_INI))
    engine.dispose()
    command.downgrade(cfg, BEFORE_EVENTS_V2)

    legacy = [
        # 3 passes, then a "-" on pass => a failed pass
        ("pass", 1, 1), ("pass", 1, 2), ("pass", 1, 3), ("pass", -1, 4),
        # two goals, then "-" => the second goal was a mistake and gets cancelled
        ("goal", 1, 10), ("goal", 1, 20), ("goal", -1, 30),
        # "-" without any earlier "+" => orphan correction
        ("foul", -1, 40),
    ]
    with engine.begin() as conn:
        for event_type, delta, sec in legacy:
            conn.execute(
                text(
                    "INSERT INTO match_events (match_id, player_id, event_type, delta, half, "
                    "second_in_match, created_at) VALUES (1, 1, :t, :d, 1, :s, '2026-01-01 10:00:00')"
                ),
                {"t": event_type, "d": delta, "s": sec},
            )
        # legacy stats row: passes were NET (3 - 1), goals clipped incrementally
        conn.execute(
            text(
                "INSERT INTO match_player_stats (match_id, player_id, goals, assists, errors, won_balls, "
                "lost_balls, fouls, passes, won_duels, lost_duels, shots_on_goal, shots_off_goal, "
                "yellow_cards, red_cards, penalties) VALUES (1, 1, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0)"
            )
        )
    engine.dispose()

    command.upgrade(cfg, "head")

    with engine.connect() as conn:
        live = conn.execute(
            text(
                "SELECT event_type, COUNT(*) FROM match_events "
                "WHERE match_id = 1 AND deleted_at IS NULL GROUP BY event_type"
            )
        ).fetchall()
        deleted = conn.execute(
            text("SELECT COUNT(*) FROM match_events WHERE match_id = 1 AND deleted_at IS NOT NULL")
        ).scalar()
        stats = conn.execute(
            text(
                "SELECT passes, passes_failed, goals, fouls FROM match_player_stats "
                "WHERE match_id = 1 AND player_id = 1"
            )
        ).one()

    assert dict(live) == {"pass": 3, "pass_failed": 1, "goal": 1}
    assert deleted == 3  # cancelled goal + its "-" and the orphan foul "-"
    assert tuple(stats) == (3, 1, 1, 0)
