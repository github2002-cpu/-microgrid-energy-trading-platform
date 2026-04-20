"""
Application configuration.

Uses pydantic-settings to load from environment variables with sensible defaults.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Global application settings."""

    # ── Application ──────────────────────────────────────────────
    APP_NAME: str = "MicroGrid Energy Trading Platform"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    # ── Database ─────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite:///./microgrid.db"

    # ── API ──────────────────────────────────────────────────────
    API_V1_PREFIX: str = "/api/v1"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
