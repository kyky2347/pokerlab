from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./pokerlab.db"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    pokerlab_max_monte_carlo: int = Field(default=500_000, ge=1, le=10_000_000)
    pokerlab_max_solver_iterations: int = Field(default=5_000, ge=100, le=1_000_000)
    pokerlab_max_concurrent_solvers: int = Field(default=2, ge=1, le=64)

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
