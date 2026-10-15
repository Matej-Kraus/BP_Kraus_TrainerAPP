"""Events v2: every event is +1, undo soft-deletes, retries are idempotent."""

from fastapi.testclient import TestClient

from .conftest import auth_headers, login_and_get_token


def _setup(client: TestClient):
    coach = auth_headers(login_and_get_token(client, "coach@demo.local", "coach"))
    assistant = auth_headers(login_and_get_token(client, "assistant@demo.local", "assistant"))
    assert client.post("/matches/1/start", headers=coach).status_code == 200
    pid = client.get("/matches/1/roster-with-stats", headers=coach).json()[0]["player_id"]
    return coach, assistant, pid


def _add(client, headers, pid, event_type="goal", sec=10, **extra):
    res = client.post(
        "/matches/1/events",
        json={"player_id": pid, "event_type": event_type, "half": 1, "second_in_match": sec, **extra},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    return res.json()


def _stats(client, headers, pid) -> dict:
    rows = client.get("/matches/1/roster-with-stats", headers=headers).json()
    return next(r for r in rows if r["player_id"] == pid)["stats"]


def test_event_is_plus_one_and_records_author(client: TestClient):
    coach, assistant, pid = _setup(client)
    ev = _add(client, assistant, pid)
    assert ev["delta"] == 1
    assert ev["created_by_email"] == "assistant@demo.local"
    listed = client.get("/matches/1/events", headers=coach).json()
    assert listed[0]["created_by_email"] == "assistant@demo.local"


def test_negative_delta_is_rejected(client: TestClient):
    coach, _assistant, pid = _setup(client)
    res = client.post(
        "/matches/1/events",
        json={"player_id": pid, "event_type": "goal", "delta": -1, "half": 1, "second_in_match": 5},
        headers=coach,
    )
    assert res.status_code == 422


def test_client_event_id_makes_retries_idempotent(client: TestClient):
    coach, _a, pid = _setup(client)
    first = _add(client, coach, pid, client_event_id="abc-123")
    again = _add(client, coach, pid, client_event_id="abc-123")
    assert first["id"] == again["id"]
    assert _stats(client, coach, pid)["goals"] == 1
    assert len(client.get("/matches/1/events", headers=coach).json()) == 1


def test_failed_pass_is_its_own_event(client: TestClient):
    coach, _a, pid = _setup(client)
    _add(client, coach, pid, "pass")
    _add(client, coach, pid, "pass")
    _add(client, coach, pid, "pass_failed")
    stats = _stats(client, coach, pid)
    assert stats["passes"] == 2 and stats["passes_failed"] == 1
    team = client.get("/seasons/1/team-stats", headers=coach).json()
    assert team["passes_success"] == 2 and team["passes_unsuccess"] == 1


def test_delete_event_recomputes_stats_and_hides_it(client: TestClient):
    coach, _a, pid = _setup(client)
    e1 = _add(client, coach, pid, sec=10)
    e2 = _add(client, coach, pid, sec=20)
    _add(client, coach, pid, sec=30)
    assert client.delete(f"/matches/1/events/{e2['id']}", headers=coach).status_code == 204
    assert _stats(client, coach, pid)["goals"] == 2
    ids = [e["id"] for e in client.get("/matches/1/events", headers=coach).json()]
    assert e2["id"] not in ids and e1["id"] in ids
    # idempotent
    assert client.delete(f"/matches/1/events/{e2['id']}", headers=coach).status_code == 204
    assert _stats(client, coach, pid)["goals"] == 2
    assert client.delete("/matches/1/events/99999", headers=coach).status_code == 404


def test_undo_last_removes_only_latest_of_that_type(client: TestClient):
    coach, _a, pid = _setup(client)
    _add(client, coach, pid, "goal", sec=10)
    last_goal = _add(client, coach, pid, "goal", sec=20)
    _add(client, coach, pid, "foul", sec=30)
    res = client.delete(f"/matches/1/events/last?player_id={pid}&event_type=goal", headers=coach)
    assert res.status_code == 200
    assert res.json()["id"] == last_goal["id"]
    stats = _stats(client, coach, pid)
    assert stats["goals"] == 1 and stats["fouls"] == 1
    # nothing left to undo for a type without events
    res = client.delete(f"/matches/1/events/last?player_id={pid}&event_type=assist", headers=coach)
    assert res.status_code == 404


def test_stats_never_go_negative_after_repeated_undo(client: TestClient):
    coach, _a, pid = _setup(client)
    _add(client, coach, pid)
    assert client.delete(f"/matches/1/events/last?player_id={pid}&event_type=goal", headers=coach).status_code == 200
    assert client.delete(f"/matches/1/events/last?player_id={pid}&event_type=goal", headers=coach).status_code == 404
    assert _stats(client, coach, pid)["goals"] == 0


def test_finished_match_events_can_only_be_edited_by_coach(client: TestClient):
    coach, assistant, pid = _setup(client)
    ev = _add(client, coach, pid)
    assert client.post("/matches/1/finish", headers=coach).status_code == 200
    assert client.delete(f"/matches/1/events/{ev['id']}", headers=assistant).status_code == 403
    assert client.delete(f"/matches/1/events/{ev['id']}", headers=coach).status_code == 204


def test_events_cannot_be_deleted_before_match_start(client: TestClient):
    coach = auth_headers(login_and_get_token(client, "coach@demo.local", "coach"))
    res = client.delete("/matches/1/events/1", headers=coach)
    assert res.status_code == 400


def test_export_skips_deleted_events(client: TestClient):
    coach, _a, pid = _setup(client)
    keep = _add(client, coach, pid, sec=10)
    drop = _add(client, coach, pid, sec=20)
    client.delete(f"/matches/1/events/{drop['id']}", headers=coach)
    csv_text = client.get("/export/matches/1/events.csv", headers=coach).text
    assert f"\n{keep['id']}," in csv_text
    assert f"\n{drop['id']}," not in csv_text
