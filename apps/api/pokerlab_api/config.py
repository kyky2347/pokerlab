from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./pokerlab.db"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    pokerlab_max_monte_carlo: int = 500_000
    pokerlab_max_solver_iterations: int = 100_000
    pokerlab_max_concurrent_solvers: int = 2

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
