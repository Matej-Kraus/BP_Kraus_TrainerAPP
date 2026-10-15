"""Data conversion for the events v2 schema (Alembic revision f1b2c3d4e5f6).

Self-contained on purpose (plain SQL, no ORM models): a migration must keep working
even after the application models change.

Old model: the live "-" button wrote events with delta=-1. Those meant either
  * a failed pass (event_type "pass") or
  * a correction of a previous +1 of the same player and type.
New model: every event is +1; a correction soft-deletes the event (deleted_at) and a
failed pass is its own event type "pass_failed".
"""

from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import bindparam, text

EVENT_TO_COLUMN = {
    "goal": "goals",
    "assist": "assists",
    "error": "errors",
    "won_ball": "won_balls",
    "lost_ball": "lost_balls",
    "foul": "fouls",
    "pass": "passes",
    "pass_failed": "passes_failed",
    "won_duel": "won_duels",
    "lost_duel": "lost_duels",
    "shot_on_goal": "shots_on_goal",
    "shot_off_goal": "shots_off_goal",
    "yellow_card": "yellow_cards",
    "red_card": "red_cards",
    "penalty": "penalties",
}
STAT_COLUMNS = tuple(EVENT_TO_COLUMN.values())

_CHUNK = 400


def _chunks(items: list[int]):
    for i in range(0, len(items), _CHUNK):
        yield items[i : i + _CHUNK]


def _write_stats(conn, per_pair: dict[tuple[int, int], dict[str, int]]) -> None:
    """Overwrite every match_player_stats row (zeros where a pair has no events)."""
    existing = {
        (int(m), int(p)) for m, p in conn.execute(text("SELECT match_id, player_id FROM match_player_stats"))
    }
    zeros = dict.fromkeys(STAT_COLUMNS, 0)
    set_clause = ", ".join(f"{c} = :{c}" for c in STAT_COLUMNS)
    insert_cols = ", ".join(("match_id", "player_id", *STAT_COLUMNS))
    insert_vals = ", ".join(f":{c}" for c in ("match_id", "player_id", *STAT_COLUMNS))
    for key in existing | set(per_pair):
        values = {**zeros, **per_pair.get(key, {})}
        params = {**values, "match_id": key[0], "player_id": key[1]}
        if key in existing:
            conn.execute(
                text(f"UPDATE match_player_stats SET {set_clause} WHERE match_id = :match_id AND player_id = :player_id"),
                params,
            )
        else:
            conn.execute(text(f"INSERT INTO match_player_stats ({insert_cols}) VALUES ({insert_vals})"), params)


def recompute_stats_v2(conn) -> None:
    """stats = count of non-deleted +1 events per (match, player, type)."""
    rows = conn.execute(
        text(
            "SELECT match_id, player_id, event_type, COUNT(*) FROM match_events "
            "WHERE deleted_at IS NULL AND delta = 1 GROUP BY match_id, player_id, event_type"
        )
    ).fetchall()
    per_pair: dict[tuple[int, int], dict[str, int]] = defaultdict(dict)
    for match_id, player_id, event_type, count in rows:
        column = EVENT_TO_COLUMN.get(event_type)
        if column:
            per_pair[(int(match_id), int(player_id))][column] = int(count)
    _write_stats(conn, per_pair)


def convert_events_to_v2(conn) -> None:
    # 1) "-" on a pass was a failed pass
    conn.execute(
        text("UPDATE match_events SET event_type = 'pass_failed', delta = 1 WHERE event_type = 'pass' AND delta = -1")
    )

    # 2) every other "-" cancels the latest still-open "+" of the same match/player/type
    groups = conn.execute(
        text("SELECT DISTINCT match_id, player_id, event_type FROM match_events WHERE delta = -1")
    ).fetchall()
    to_delete: list[int] = []
    for match_id, player_id, event_type in groups:
        events = conn.execute(
            text(
                "SELECT id, delta FROM match_events "
                "WHERE match_id = :m AND player_id = :p AND event_type = :t ORDER BY second_in_match, id"
            ),
            {"m": match_id, "p": player_id, "t": event_type},
        ).fetchall()
        open_adds: list[int] = []
        for event_id, delta in events:
            if delta > 0:
                open_adds.append(int(event_id))
            else:
                to_delete.append(int(event_id))  # the correction itself
                if open_adds:
                    to_delete.append(open_adds.pop())  # the event it corrected
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    stmt = text("UPDATE match_events SET deleted_at = :now WHERE id IN :ids").bindparams(
        bindparam("ids", expanding=True)
    )
    for chunk in _chunks(to_delete):
        conn.execute(stmt, {"now": now, "ids": chunk})

    # 3) statistics are derived data: rebuild them from the remaining events
    recompute_stats_v2(conn)


def convert_events_from_v2(conn) -> None:
    """Best-effort reverse: failed passes become pass/-1 again, cancelled pairs are dropped."""
    conn.execute(text("DELETE FROM match_events WHERE deleted_at IS NOT NULL"))
    conn.execute(
        text("UPDATE match_events SET event_type = 'pass', delta = -1 WHERE event_type = 'pass_failed'")
    )
    rows = conn.execute(
        text(
            "SELECT match_id, player_id, event_type, SUM(delta) FROM match_events "
            "GROUP BY match_id, player_id, event_type"
        )
    ).fetchall()
    per_pair: dict[tuple[int, int], dict[str, int]] = defaultdict(dict)
    for match_id, player_id, event_type, total in rows:
        column = EVENT_TO_COLUMN.get(event_type)
        if column and column != "passes_failed":
            per_pair[(int(match_id), int(player_id))][column] = max(0, int(total))
    _write_stats(conn, per_pair)
