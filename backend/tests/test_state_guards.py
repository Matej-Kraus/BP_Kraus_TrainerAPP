"""Match state guards: lineup only before kick-off, only a running match can be finished."""

from fastapi.testclient import TestClient

from .conftest import auth_headers, login_and_get_token


def _coach(client: TestClient) -> dict[str, str]:
    return auth_headers(login_and_get_token(client, "coach@demo.local", "coach"))


def _current_lineup(client: TestClient, headers) -> dict:
    roster = client.get("/matches/1/roster", headers=headers).json()
    return {
        "items": [
            {"player_id": r["player_id"], "jersey_number_match": r["jersey_number_match"], "role": r["role"]}
            for r in roster
        ]
    }


def test_lineup_can_be_saved_before_the_match_starts(client: TestClient):
    h = _coach(client)
    res = client.put("/matches/1/lineup", json=_current_lineup(client, h), headers=h)
    assert res.status_code == 200, res.text


def test_lineup_is_locked_once_the_match_started(client: TestClient):
    h = _coach(client)
    payload = _current_lineup(client, h)
    assert client.post("/matches/1/start", headers=h).status_code == 200
    res = client.put("/matches/1/lineup", json=payload, headers=h)
    assert res.status_code == 400
    assert "before the match starts" in res.json()["detail"]


def test_lineup_is_locked_after_the_match_finished(client: TestClient):
    h = _coach(client)
    payload = _current_lineup(client, h)
    client.post("/matches/1/start", headers=h)
    client.post("/matches/1/finish", headers=h)
    assert client.put("/matches/1/lineup", json=payload, headers=h).status_code == 400


def test_cannot_finish_a_match_that_never_started(client: TestClient):
    h = _coach(client)
    res = client.post("/matches/1/finish", headers=h)
    assert res.status_code == 400
    assert res.json() == {"detail": "Match has not started"}
    assert client.get("/matches/1", headers=h).json()["status"] == "planned"


def test_finish_is_idempotent(client: TestClient):
    h = _coach(client)
    client.post("/matches/1/start", headers=h)
    first = client.post("/matches/1/finish", headers=h)
    again = client.post("/matches/1/finish", headers=h)
    assert first.status_code == again.status_code == 200
    assert again.json()["status"] == "finished"
    assert again.json()["seconds_before_live"] == first.json()["seconds_before_live"]


def test_finish_works_from_half_time(client: TestClient):
    h = _coach(client)
    client.post("/matches/1/start", headers=h)
    client.post("/matches/1/half-time", headers=h)
    assert client.post("/matches/1/finish", headers=h).status_code == 200
