from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DB_URL = f"sqlite:///{(BACKEND_DIR / 'app.db').resolve()}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="TRAINERAPP_",
        env_file=str(BACKEND_DIR / ".env"),
    )

    secret_key: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_exp_minutes: int = 60 * 24  # 24h
    database_url: str = DEFAULT_DB_URL

    frontend_base_url: str = "http://127.0.0.1:5173"
    frontend_extra_origins: str = ""
    allow_localhost_origins: bool = True

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_use_tls: bool = True

    @property
    def cors_allowed_origins(self) -> list[str]:
        origins: list[str] = []
        base = self.frontend_base_url.strip().rstrip("/")
        if base:
            origins.append(base)

        extra = [x.strip().rstrip("/") for x in self.frontend_extra_origins.split(",")]
        origins.extend([x for x in extra if x])
        return list(dict.fromkeys(origins))


settings = Settings()

