import os
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
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


@pytest.fixture(
    params=["sqlite"] + (["postgresql"] if os.getenv("POKERLAB_TEST_POSTGRES_URL") else [])
)
def storage_db(request, monkeypatch):
    """Real databases, unique schema per PostgreSQL test; never touch public tables."""
    if request.param == "sqlite":
        yield database.engine
        return
    url = make_url(os.environ["POKERLAB_TEST_POSTGRES_URL"])
    assert url.get_backend_name() == "postgresql"
    schema = f"pokerlab_test_{uuid4().hex}"
    admin = create_engine(url)
    with admin.begin() as connection:
        connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
    scoped_url = url.update_query_dict({"options": f"-csearch_path={schema}"})
    engine = create_engine(scoped_url)
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(database, "SessionLocal", sessionmaker(bind=engine, expire_on_commit=False))
    monkeypatch.setattr(database, "active_database", "postgresql")
    monkeypatch.setattr(
        database,
        "settings",
        database.settings.model_copy(
            update={"database_url": scoped_url.render_as_string(hide_password=False)}
        ),
    )
    try:
        yield engine
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
        admin.dispose()
