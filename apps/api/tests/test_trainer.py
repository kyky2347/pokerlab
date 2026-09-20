import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from pokerlab_api import database
from pokerlab_api.database import TrainerAnswer, TrainerQuestion
from pokerlab_api.engine import PythonPokerEngine
from pokerlab_api.main import app
from pokerlab_api.trainer import create_question, score_answer

pytestmark = pytest.mark.usefixtures("storage_db")


def issue_question():
    database.initialize_database()
    with database.SessionLocal() as session:
        return create_question(7, PythonPokerEngine(), session)


def test_question_is_persisted_without_revealing_equity():
    question = issue_question()
    assert "true_equity" not in question
    assert "equity" not in question
    assert question["engine"] == "Python reference"
    expires = datetime.fromisoformat(question["expires_at"])
    assert timedelta(hours=23) < expires - datetime.now(UTC) < timedelta(hours=25)
    with database.SessionLocal() as session:
        stored = session.get(TrainerQuestion, question["id"])
        assert stored.seed == question["seed"]
        assert stored.hero == list(question["hero"])
        assert stored.answered_at is None


def test_answer_can_be_submitted_by_a_separate_process(storage_db):
    question = issue_question()
    script = """
import json, sys
from pokerlab_api.database import SessionLocal
from pokerlab_api.trainer import score_answer
with SessionLocal() as session:
    print(json.dumps(score_answer(sys.argv[1], 0.5, session)))
"""
    result = subprocess.run(
        [sys.executable, "-c", script, question["id"]],
        env={**os.environ, "DATABASE_URL": storage_db.url.render_as_string(hide_password=False)},
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["category"] == question["category"]
    with database.SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(TrainerAnswer)) == 1


def test_simultaneous_answers_are_scored_exactly_once():
    question = issue_question()

    def answer(_):
        with database.SessionLocal() as session:
            try:
                return score_answer(question["id"], 0.5, session)
            except ValueError:
                return None

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(answer, range(8)))
    assert sum(result is not None for result in results) == 1
    with database.SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(TrainerAnswer)) == 1
        assert session.get(TrainerQuestion, question["id"]).answered_at is not None


def test_failed_commit_does_not_consume_the_question(monkeypatch):
    question = issue_question()
    with database.SessionLocal() as session:

        def fail_commit():
            raise OperationalError("commit", {}, Exception("injected failure"))

        monkeypatch.setattr(session, "commit", fail_commit)
        with pytest.raises(OperationalError):
            score_answer(question["id"], 0.5, session)
    with database.SessionLocal() as session:
        assert session.get(TrainerQuestion, question["id"]).answered_at is None
        assert session.scalar(select(func.count()).select_from(TrainerAnswer)) == 0
        assert score_answer(question["id"], 0.5, session)["answer"] == 0.5


def test_expired_questions_do_not_affect_training_history():
    question = issue_question()
    with database.SessionLocal() as session:
        session.get(TrainerQuestion, question["id"]).expires_at = datetime.now(UTC) - timedelta(
            seconds=1
        )
        session.commit()
        with pytest.raises(ValueError, match="expired"):
            score_answer(question["id"], 0.5, session)
        assert session.scalar(select(func.count()).select_from(TrainerAnswer)) == 0


def test_scoring_with_an_existing_session_identity_does_not_compare_naive_dates():
    question = issue_question()
    with database.SessionLocal() as session:
        loaded = session.get(TrainerQuestion, question["id"])
        result = score_answer(question["id"], 0.5, session)
        assert result["category"] == loaded.category
        assert loaded.answered_at is not None


@pytest.mark.parametrize("answer", [-0.1, 1.1, float("nan")])
def test_invalid_answers_leave_question_available(answer):
    question = issue_question()
    with database.SessionLocal() as session:
        with pytest.raises(ValueError, match="between"):
            score_answer(question["id"], answer, session)
        assert session.get(TrainerQuestion, question["id"]).answered_at is None


def test_seeded_scenario_selection_remains_reproducible():
    first, second = issue_question(), issue_question()
    for key in ("hero", "villain", "board", "seed", "category", "adaptive_weight"):
        assert first[key] == second[key]


def test_api_lifecycle_restart_preserves_question_and_rejects_replay():
    with TestClient(app) as client:
        response = client.post("/trainer/question", json={"seed": 2**63 - 1})
        assert response.status_code == 200, response.text
        question_id = response.json()["id"]
    with TestClient(app) as client:
        response = client.post("/trainer/answer", json={"question_id": question_id, "answer": 0.5})
        assert response.status_code == 200, response.text
        assert 0 <= response.json()["score"] <= 100
        replay = client.post("/trainer/answer", json={"question_id": question_id, "answer": 0.5})
        assert replay.status_code == 422
        assert replay.json()["error"]["code"] == "invalid_poker_state"
