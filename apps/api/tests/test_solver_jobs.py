import json
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import event, null, select, text
from sqlalchemy.exc import IntegrityError

from pokerlab_api import database, main
from pokerlab_api.database import SolverJob
from pokerlab_api.engine import PythonPokerEngine
from pokerlab_api.schemas import SolverRequest

pytestmark = pytest.mark.usefixtures("storage_db")


@pytest.fixture(autouse=True)
def solver_fixture(storage_db, monkeypatch):
    database.initialize_database()
    monkeypatch.setattr(main, "solver_slots", threading.BoundedSemaphore(1))


def payload(**overrides):
    return SolverRequest(
        **{
            "board": ["Ah", "Kd", "7s", "3c", "2d"],
            "oop_range": {"AQo": 1},
            "ip_range": {"KQo": 1},
            "iterations": 100,
            **overrides,
        }
    )


def assert_slot_available():
    assert main.solver_slots.acquire(blocking=False)
    main.solver_slots.release()


def test_successful_solver_job_survives_a_fresh_session(monkeypatch):
    # This suite isolates persistence; the math suite exercises actual iterations.
    monkeypatch.setattr(main.RiverCFRSolver, "solve", lambda *_: {"iterations": 100})
    with database.SessionLocal() as db:
        result = main.create_solver_job(payload(), db, PythonPokerEngine())
    with database.SessionLocal() as db:
        job = db.get(SolverJob, result["id"])
        assert job.status == result["status"] == "completed"
        assert job.results["engine"] == result["engine"] == "Python reference"
        assert job.runtime_ms >= 0
    assert_slot_available()


@pytest.mark.parametrize("stage", ["insert", "complete"])
def test_real_flush_failure_rolls_back_and_preserves_original_error(stage, monkeypatch):
    solve = Mock(return_value={"iterations": 100})
    monkeypatch.setattr(main.RiverCFRSolver, "solve", solve)
    with database.SessionLocal() as db:
        injected = False

        @event.listens_for(db, "before_flush")
        def break_one_write(session, *_):
            nonlocal injected
            for job in list(session.new) + list(session.dirty):
                wanted = "running" if stage == "insert" else "completed"
                if isinstance(job, SolverJob) and job.status == wanted and not injected:
                    injected = True
                    job.status = null()  # Bypass the INSERT default: a real NOT NULL violation.

        with pytest.raises(IntegrityError):
            main.create_solver_job(payload(), db, PythonPokerEngine())
        assert injected
        assert db.scalar(text("SELECT 1")) == 1  # Session is usable, not pending rollback.
    with database.SessionLocal() as db:
        jobs = db.scalars(select(SolverJob)).all()
        if stage == "insert":
            assert jobs == []
            solve.assert_not_called()
        else:
            assert len(jobs) == 1
            assert jobs[0].status == "failed"
            assert jobs[0].results == {"error_type": "IntegrityError"}
    assert_slot_available()


def test_solver_failure_is_saved_without_exception_details(monkeypatch):
    failure = RuntimeError("private solver details must not be stored")
    monkeypatch.setattr(main.RiverCFRSolver, "solve", Mock(side_effect=failure))
    with database.SessionLocal() as db:
        with pytest.raises(RuntimeError) as raised:
            main.create_solver_job(payload(), db, PythonPokerEngine())
        assert raised.value is failure
    with database.SessionLocal() as db:
        job = db.scalars(select(SolverJob)).one()
        assert job.status == "failed"
        assert job.results == {"error_type": "RuntimeError"}
        assert job.runtime_ms >= 0
    assert_slot_available()


def test_failure_record_write_cannot_mask_original_error(monkeypatch, caplog):
    failure = RuntimeError("private original failure")
    monkeypatch.setattr(main.RiverCFRSolver, "solve", Mock(side_effect=failure))
    with database.SessionLocal() as db:

        @event.listens_for(db, "before_flush")
        def break_failure_write(session, *_):
            for job in session.dirty:
                if isinstance(job, SolverJob) and job.status == "failed":
                    job.status = None

        with pytest.raises(RuntimeError) as raised:
            main.create_solver_job(payload(), db, PythonPokerEngine())
        assert raised.value is failure
        assert db.scalar(text("SELECT 1")) == 1
    with database.SessionLocal() as db:
        assert db.scalars(select(SolverJob)).one().status == "running"
    events = [json.loads(record.message) for record in caplog.records if record.name == "pokerlab"]
    assert any(event["event"] == "solver_failure_record_error" for event in events)
    assert "private original failure" not in caplog.text
    assert_slot_available()


@pytest.mark.parametrize(
    "overrides",
    [
        {"board": ["Ah", "Ah", "7s", "3c", "2d"]},
        {"oop_range": {"bad": 1}},
        {"oop_range": {"AA": 1}, "ip_range": {"AA": 1}},
        {"oop_range": {"AQo": 1e-300}, "ip_range": {"KQo": 1e-300}},
    ],
)
def test_invalid_solver_requests_never_create_jobs(overrides):
    with TestClient(main.app) as client:
        response = client.post("/solver/jobs", json=payload(**overrides).model_dump())
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "invalid_poker_state"
    with database.SessionLocal() as db:
        assert db.scalars(select(SolverJob)).all() == []
    assert_slot_available()


def test_concurrent_request_is_rejected_without_creating_a_job(monkeypatch):
    entered, release = threading.Event(), threading.Event()

    def hold_solver(*_):
        entered.set()
        assert release.wait(10)
        return {"iterations": 100}

    monkeypatch.setattr(main.RiverCFRSolver, "solve", hold_solver)

    def run():
        with database.SessionLocal() as db:
            return main.create_solver_job(payload(), db, PythonPokerEngine())

    with ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(run)
        try:
            assert entered.wait(10)
            with pytest.raises(HTTPException) as raised:
                run()
            assert raised.value.status_code == 429
        finally:
            release.set()
        assert first.result(timeout=10)["status"] == "completed"
    with database.SessionLocal() as db:
        assert len(db.scalars(select(SolverJob)).all()) == 1
    assert_slot_available()
