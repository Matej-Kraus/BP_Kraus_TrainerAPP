import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Use isolated DB for tests (prevents clashes with running dev servers)
# Set TRAINERAPP_TEST_DATABASE_URL (e.g. postgresql+psycopg://...) to run against PostgreSQL.
TEST_DATABASE_URL = os.getenv("TRAINERAPP_TEST_DATABASE_URL", "sqlite:///./test.db")
os.environ["TRAINERAPP_DATABASE_URL"] = TEST_DATABASE_URL
os.environ["TRAINERAPP_ALLOW_DB_RESET"] = "true"  # test database is disposable

# Ensure backend/ is on sys.path for imports like `app.main`
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402
from app.scripts import seed  # noqa: E402


@pytest.fixture()
def client() -> TestClient:
    # Fresh DB for each test (thesis-friendly determinism over speed)
    seed.main()
    return TestClient(app)


def login_and_get_token(client: TestClient, email: str, password: str) -> str:
    res = client.post("/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}

