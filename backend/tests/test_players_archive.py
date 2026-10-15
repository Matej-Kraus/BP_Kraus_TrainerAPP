"""Players with match history are archived instead of deleted (hard delete would break FKs)."""

from fastapi.testclient import TestClient

from .conftest import auth_headers, login_and_get_token


def _coach(client: TestClient) -> dict[str, str]:
    return auth_headers(login_and_get_token(client, "coach@demo.local", "coach"))


def _create_player(client: TestClient, headers: dict[str, str], jersey: int = 88) -> int:
    res = client.post(
        "/players",
        json={"first_name": "Nový", "last_name": "Hráč", "jersey_number": jersey, "season_id": 1},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    return res.json()["id"]


def test_delete_player_without_history(client: TestClient):
    h = _coach(client)
    pid = _create_player(client, h)
    assert client.delete(f"/players/{pid}", headers=h).status_code == 200
    ids = [p["id"] for p in client.get("/players?include_archived=true", headers=h).json()]
    assert pid not in ids


def test_delete_player_with_history_is_rejected_not_500(client: TestClient):
    h = _coach(client)
    # Seed player 1 is in the lineup of match 1.
    res = client.delete("/players/1", headers=h)
    assert res.status_code == 409
    assert "archive" in res.json()["detail"].lower()
    ids = [p["id"] for p in client.get("/players", headers=h).json()]
    assert 1 in ids


def test_archive_hides_player_and_unarchive_restores(client: TestClient):
    h = _coach(client)
    res = client.post("/players/15/archive", headers=h)
    assert res.status_code == 200
    assert res.json()["archived_at"] is not None

    assert 15 not in [p["id"] for p in client.get("/players?season_id=1", headers=h).json()]
    with_archived = client.get("/players?season_id=1&include_archived=true", headers=h).json()
    assert 15 in [p["id"] for p in with_archived]

    # Still visible in the lineup editor of the match they are nominated in...
    editor = client.get("/matches/1/lineup-editor", headers=h).json()
    assert 15 in [p["player_id"] for p in editor["players"]]

    assert client.post("/players/15/unarchive", headers=h).json()["archived_at"] is None
    assert 15 in [p["id"] for p in client.get("/players?season_id=1", headers=h).json()]


def test_archived_player_not_offered_for_new_match_lineup(client: TestClient):
    h = _coach(client)
    pid = _create_player(client, h)
    client.post(f"/players/{pid}/archive", headers=h)
    match = client.post(
        "/matches",
        json={"season_id": 1, "opponent": "Test", "match_date": "2030-01-01T10:00:00"},
        headers=h,
    ).json()
    editor = client.get(f"/matches/{match['id']}/lineup-editor", headers=h).json()
    assert pid not in [p["player_id"] for p in editor["players"]]


def test_archived_player_frees_jersey_number(client: TestClient):
    h = _coach(client)
    pid = _create_player(client, h, jersey=77)
    client.post(f"/players/{pid}/archive", headers=h)
    again = client.post(
        "/players",
        json={"first_name": "Další", "last_name": "Hráč", "jersey_number": 77, "season_id": 1},
        headers=h,
    )
    assert again.status_code == 200, again.text


def test_assistant_cannot_archive(client: TestClient):
    token = login_and_get_token(client, "assistant@demo.local", "assistant")
    assert client.post("/players/1/archive", headers=auth_headers(token)).status_code == 403


def test_remove_player_from_season(client: TestClient):
    h = _coach(client)
    pid = _create_player(client, h)
    assert client.delete(f"/seasons/1/players/{pid}", headers=h).status_code == 200
    assert pid not in [p["id"] for p in client.get("/players?season_id=1", headers=h).json()]
    # Removing again -> not in season
    assert client.delete(f"/seasons/1/players/{pid}", headers=h).status_code == 404


def test_cannot_remove_nominated_player_from_season(client: TestClient):
    h = _coach(client)
    res = client.delete("/seasons/1/players/1", headers=h)
    assert res.status_code == 409
