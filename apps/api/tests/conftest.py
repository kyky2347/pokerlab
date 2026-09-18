import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from pokerlab_api import database


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch):
    """API tests must never write experiments into a developer's real ledger."""
    url = f"sqlite:///{tmp_path / 'test.db'}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(database, "SessionLocal", sessionmaker(bind=engine, expire_on_commit=False))
    monkeypatch.setattr(
        database, "settings", database.settings.model_copy(update={"database_url": url})
    )
    monkeypatch.setattr(database, "active_database", "sqlite")
    yield
    engine.dispose()
