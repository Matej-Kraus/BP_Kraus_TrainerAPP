"""Domain errors (AppError) are mapped to {"detail": ...} by the global handler in main.py."""

from fastapi.testclient import TestClient

from .conftest import auth_headers, login_and_get_token


def test_unknown_match_returns_404_detail(client: TestClient):
    coach = login_and_get_token(client, "coach@demo.local", "coach")
    res = client.get("/matches/9999", headers=auth_headers(coach))
    assert res.status_code == 404
    assert res.json() == {"detail": "Match not found"}


def test_start_twice_returns_400_detail(client: TestClient):
    coach = login_and_get_token(client, "coach@demo.local", "coach")
    assert client.post("/matches/1/start", headers=auth_headers(coach)).status_code == 200
    res = client.post("/matches/1/start", headers=auth_headers(coach))
    assert res.status_code == 400
    assert res.json() == {"detail": "Match is not in planned state"}


def test_ratings_before_finish_returns_400_detail(client: TestClient):
    coach = login_and_get_token(client, "coach@demo.local", "coach")
    res = client.put("/matches/1/ratings", json={"items": []}, headers=auth_headers(coach))
    assert res.status_code == 400
    assert "after the match is finished" in res.json()["detail"]


def test_lineup_for_unknown_match_returns_404_detail(client: TestClient):
    coach = login_and_get_token(client, "coach@demo.local", "coach")
    res = client.put("/matches/9999/lineup", json={"items": []}, headers=auth_headers(coach))
    assert res.status_code == 404
    assert res.json() == {"detail": "Match not found"}
