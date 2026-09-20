import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import MetaData, Table, inspect, text
from sqlalchemy.exc import OperationalError

from pokerlab_api import database, migrations
from pokerlab_api.database import Experiment, SolverJob, TrainerAnswer
from pokerlab_api.main import app

pytestmark = pytest.mark.usefixtures("storage_db")


def legacy_database(engine, versioned):
    with engine.begin() as connection:
        if engine.dialect.name == "sqlite":
            connection.exec_driver_sql("BEGIN IMMEDIATE")
        config = migrations.migration_config()
        config.attributes["connection"] = connection
        command.upgrade(config, "0001_initial")
        now = datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)
        records = {
            "experiments": dict(
                id="legacy-experiment",
                experiment_type="monte_carlo",
                parameters={"seed": 7},
                results={"equity": 0.5},
                seed=7,
                engine="Python reference",
                runtime_ms=1.0,
                created_at=now,
            ),
            "trainer_answers": dict(
                id="legacy-answer",
                category="flush_draw",
                difficulty="core",
                answer=0.5,
                true_equity=0.6,
                absolute_error=0.1,
                score=84,
                created_at=now,
            ),
            "solver_jobs": dict(
                id="legacy-job",
                status="completed",
                parameters={"iterations": 100},
                results={"fixture": "preserve"},
                runtime_ms=10,
                created_at=now,
            ),
        }
        for name, values in records.items():
            table = Table(name, MetaData(), autoload_with=connection)
            connection.execute(table.insert().values(**values))
        if not versioned:
            connection.exec_driver_sql("DROP TABLE alembic_version")


def test_fresh_schema_and_repeat_startup_are_idempotent(storage_db):
    database.initialize_database()
    database.initialize_database()
    with storage_db.connect() as connection:
        assert (
            connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            == "0002_durable_training"
        )
    assert "trainer_questions" in inspect(storage_db).get_table_names()
    indexes = {index["name"] for index in inspect(storage_db).get_indexes("experiments")}
    assert "ix_experiments_timeline" in indexes
    with storage_db.connect() as connection:
        assert (
            compare_metadata(MigrationContext.configure(connection), database.Base.metadata) == []
        )


@pytest.mark.parametrize("versioned", [False, True])
def test_legacy_upgrade_preserves_all_existing_records(storage_db, versioned):
    legacy_database(storage_db, versioned)
    database.initialize_database()
    with database.SessionLocal() as session:
        experiment = session.get(Experiment, "legacy-experiment")
        assert experiment.seed == 7
        assert experiment.results == {"equity": 0.5}
        answer = session.get(TrainerAnswer, "legacy-answer")
        assert answer.score == 84
        assert answer.question_id is None
        assert session.get(SolverJob, "legacy-job").results == {"fixture": "preserve"}
    # This must exercise the migrated PostgreSQL column, not just fresh metadata.
    with TestClient(app) as client:
        response = client.post(
            "/equity/monte-carlo",
            json={
                "hero": ["As", "Ks"],
                "villain": ["Qh", "Qd"],
                "board": ["Js", "8s", "2c"],
                "samples": 10,
                "seed": 2**63 - 1,
            },
        )
        assert response.status_code == 200, response.text
        saved = client.get(f"/experiments/{response.json()['experiment_id']}").json()
        assert saved["seed"] == saved["parameters"]["seed"] == 2**63 - 1


def test_incomplete_legacy_database_is_not_stamped_or_overwritten(storage_db):
    with storage_db.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE experiments (id VARCHAR(36) PRIMARY KEY)")
    with pytest.raises(RuntimeError, match="Incomplete legacy"):
        database.initialize_database()
    assert inspect(storage_db).get_table_names() == ["experiments"]


def test_unrecognized_legacy_layout_is_not_stamped(storage_db):
    legacy_database(storage_db, versioned=False)
    with storage_db.begin() as connection:
        connection.exec_driver_sql("ALTER TABLE experiments ADD COLUMN unexpected INTEGER")
    with pytest.raises(RuntimeError, match="Unrecognized legacy"):
        database.initialize_database()
    assert "alembic_version" not in inspect(storage_db).get_table_names()


def test_failed_ddl_rolls_back_without_partial_schema(storage_db, monkeypatch):
    def fail_upgrade(config, _revision):
        config.attributes["connection"].exec_driver_sql("CREATE TABLE rollback_probe (id INTEGER)")
        raise RuntimeError("injected migration failure")

    monkeypatch.setattr(migrations.command, "upgrade", fail_upgrade)
    with pytest.raises(RuntimeError, match="injected migration"):
        database.initialize_database()
    assert inspect(storage_db).get_table_names() == []


def test_database_errors_never_redirect_to_a_different_database(storage_db, monkeypatch):
    def fail(_engine):
        raise OperationalError("test query", {}, Exception("sensitive connection detail"))

    monkeypatch.setattr(database, "upgrade_database", fail)
    with pytest.raises(RuntimeError, match="no fallback database") as raised:
        database.initialize_database()
    assert "sensitive" not in str(raised.value)
    assert database.engine is storage_db
    assert database.SessionLocal.kw["bind"] is storage_db


def test_concurrent_startup_serializes_schema_updates(storage_db):
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda _: database.initialize_database(), range(4)))
    with storage_db.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM alembic_version")).scalar_one() == 1


def test_separate_workers_can_upgrade_the_same_database_safely(storage_db):
    def start_worker(_):
        return subprocess.run(
            [sys.executable, "-m", "pokerlab_api.migrations"],
            env={
                **os.environ,
                "DATABASE_URL": storage_db.url.render_as_string(hide_password=False),
            },
            capture_output=True,
            text=True,
            timeout=30,
        )

    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(start_worker, range(3)))
    assert all(result.returncode == 0 for result in results), [result.stderr for result in results]
    with storage_db.connect() as connection:
        assert (
            connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            == "0002_durable_training"
        )


def test_history_uses_stable_order_and_explicit_utc(storage_db):
    database.initialize_database()
    timestamp = datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)
    with database.SessionLocal() as session:
        session.add_all(
            [
                Experiment(
                    id=value,
                    experiment_type="fixture",
                    parameters={},
                    results={},
                    seed=None,
                    engine="Python reference",
                    runtime_ms=0,
                    created_at=timestamp,
                )
                for value in ("a", "c", "b")
            ]
        )
        session.commit()
    with TestClient(app) as client:
        records = client.get("/experiments?limit=2").json()["experiments"]
        assert [record["id"] for record in records] == ["c", "b"]
        assert all(record["timestamp"] == "2026-01-02T03:04:05+00:00" for record in records)


def test_downgrade_refuses_to_discard_questions_or_narrow_seeds(storage_db):
    database.initialize_database()
    with storage_db.begin() as connection:
        config = migrations.migration_config()
        config.attributes["connection"] = connection
        with pytest.raises(RuntimeError, match="forward-only"):
            command.downgrade(config, "0001_initial")
    assert "trainer_questions" in inspect(storage_db).get_table_names()
