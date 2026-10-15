"""Ratings are defined once (rating_service) and every endpoint must agree with it."""

from fastapi.testclient import TestClient

from app.models.match_player_stats import MatchPlayerStats
from app.services.rating_service import AUTO_WEIGHT, COACH_WEIGHT, auto_rating, final_rating

from .conftest import auth_headers, login_and_get_token


def test_baseline_rating_without_stats():
    assert auto_rating(None) == 5.1
    assert auto_rating(MatchPlayerStats()) == 5.1  # unset columns count as zero


def test_goals_raise_and_errors_lower_the_rating():
    assert auto_rating(MatchPlayerStats(goals=2)) > auto_rating(MatchPlayerStats())
    assert auto_rating(MatchPlayerStats(errors=3, red_cards=1)) < auto_rating(MatchPlayerStats())


def test_rating_stays_within_1_to_10():
    assert auto_rating(MatchPlayerStats(goals=50)) == 10.0
    assert auto_rating(MatchPlayerStats(errors=50, red_cards=5)) == 1.0


def test_failed_passes_cancel_successful_ones():
    assert auto_rating(MatchPlayerStats(passes=10, passes_failed=10)) == auto_rating(MatchPlayerStats())


def test_final_rating_is_weighted_mix_with_coach_mark():
    assert (AUTO_WEIGHT, COACH_WEIGHT) == (0.8, 0.2)
    assert final_rating(6.0, None) == 6.0
    assert final_rating(6.0, 10) == 6.8  # 0.8 * 6 + 0.2 * 10
    assert final_rating(5.1, 10) == 6.1  # rounds half up


def test_invalid_coach_marks_are_ignored():
    assert final_rating(6.0, 0) == 6.0
    assert final_rating(6.0, 11) == 6.0


def test_endpoints_agree_on_the_final_rating(client: TestClient):
    coach = auth_headers(login_and_get_token(client, "coach@demo.local", "coach"))
    assert client.post("/matches/1/start", headers=coach).status_code == 200
    roster = client.get("/matches/1/roster-with-stats", headers=coach).json()
    pid = roster[0]["player_id"]
    for sec in (10, 20, 30):
        client.post(
            "/matches/1/events",
            json={"player_id": pid, "event_type": "goal", "half": 1, "second_in_match": sec},
            headers=coach,
        )
    assert client.post("/matches/1/finish", headers=coach).status_code == 200

    def row():
        rows = client.get("/matches/1/roster-with-stats", headers=coach).json()
        return next(r for r in rows if r["player_id"] == pid)

    before = row()
    assert before["coach_rating"] is None
    assert before["auto_rating"] > 5.1
    assert before["final_rating"] == before["auto_rating"]

    res = client.put(
        "/matches/1/ratings",
        json={"items": [{"player_id": pid, "rating": 10}]},
        headers=coach,
    )
    assert res.status_code == 200, res.text

    after = row()
    expected = final_rating(after["auto_rating"], 10)
    assert after["coach_rating"] == 10
    assert after["final_rating"] == expected

    leaderboard = client.get("/seasons/1/leaderboards", headers=coach).json()
    assert next(r for r in leaderboard if r["player_id"] == pid)["avg_rating"] == expected

    perf = client.get(f"/players/{pid}/performance?season_id=1", headers=coach).json()
    assert perf[0]["auto_rating"] == after["auto_rating"]
    assert perf[0]["final_rating"] == expected


def test_rating_config_exposes_weights(client: TestClient):
    coach = auth_headers(login_and_get_token(client, "coach@demo.local", "coach"))
    res = client.get("/rating-config", headers=coach)
    assert res.status_code == 200
    assert res.json() == {"auto_weight": 0.8, "coach_weight": 0.2}
