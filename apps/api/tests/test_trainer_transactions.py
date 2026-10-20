"""Trainer feedback must be prepared before its one-time claim is committed."""

from concurrent.futures import ThreadPoolExecutor
from threading import Lock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select
from sqlalchemy.exc import OperationalError

from pokerlab_api import database, trainer
from pokerlab_api.database import TrainerAnswer, TrainerQuestion
from pokerlab_api.engine import PythonPokerEngine
from pokerlab_api.main import app
from pokerlab_api.trainer import create_question, score_answer

pytestmark = pytest.mark.usefixtures("storage_db")


def issue_question():
    database.initialize_database()
    with database.SessionLocal() as session:
        return create_question(7, PythonPokerEngine(), session)


@pytest.mark.parametrize("stage", ["insert", "feedback", "commit"])
def test_precommit_failure_does_not_consume_question(storage_db, stage):
    question = issue_question()

    def fail_query(_conn, _cursor, statement, _parameters, _context, _executemany):
        if (stage == "feedback" and "GROUP BY trainer_answers.category" in statement) or (
            stage == "insert" and statement.startswith("INSERT INTO trainer_answers")
        ):
            raise OperationalError("trainer query", {}, Exception("injected failure"))

    def fail_commit(_session):
        if stage == "commit":
            raise OperationalError("commit", {}, Exception("injected failure"))

    with database.SessionLocal() as session:
        event.listen(storage_db, "before_cursor_execute", fail_query)
        event.listen(session, "before_commit", fail_commit)
        try:
            with pytest.raises(OperationalError, match="injected failure"):
                score_answer(question["id"], 0.5, session)
        finally:
            event.remove(storage_db, "before_cursor_execute", fail_query)
            event.remove(session, "before_commit", fail_commit)
        assert not session.in_transaction()
        # Verify durable rollback independently of the scoring identity map.
        with database.SessionLocal() as reader:
            assert reader.get(TrainerQuestion, question["id"]).answered_at is None
            assert reader.scalar(select(func.count()).select_from(TrainerAnswer)) == 0
        assert session.get(TrainerQuestion, question["id"]).answered_at is None
        assert session.scalar(select(func.count()).select_from(TrainerAnswer)) == 0
        assert score_answer(question["id"], 0.5, session)["answer"] == 0.5


@pytest.mark.parametrize("autoflush", [True, False])
@pytest.mark.parametrize("expire_on_commit", [True, False])
def test_feedback_includes_current_answer_with_session_options(autoflush, expire_on_commit):
    question = issue_question()
    with database.SessionLocal(autoflush=autoflush, expire_on_commit=expire_on_commit) as session:
        result = score_answer(question["id"], 0.5, session)
        assert result["weaknesses"] == [
            {
                "category": question["category"],
                "average_error": result["absolute_error"],
                "answers": 1,
            }
        ]


@pytest.mark.parametrize("expire_on_commit", [True, False])
def test_scoring_never_reads_database_after_commit(storage_db, expire_on_commit):
    question = issue_question()
    committed = False

    def mark_committed(_session):
        nonlocal committed
        committed = True

    def forbid_late_query(_conn, _cursor, _statement, _parameters, _context, _executemany):
        assert not committed, "Response construction queried the database after commit"

    with database.SessionLocal(expire_on_commit=expire_on_commit) as session:
        event.listen(session, "after_commit", mark_committed)
        event.listen(storage_db, "before_cursor_execute", forbid_late_query)
        try:
            result = score_answer(question["id"], 0.5, session)
        finally:
            event.remove(storage_db, "before_cursor_execute", forbid_late_query)
        assert committed
        assert result["category"] == question["category"]
        assert result["weaknesses"][0]["answers"] == 1
        assert not session.in_transaction()


def test_feedback_query_shares_claim_transaction_and_follows_insert(storage_db):
    question = issue_question()
    statements = []
    connections = []

    def trace(conn, _cursor, statement, _parameters, _context, _executemany):
        connections.append(conn)
        if statement.startswith("UPDATE trainer_questions"):
            statements.append("claim")
        elif statement.startswith("INSERT INTO trainer_answers"):
            statements.append("insert")
        elif "GROUP BY trainer_answers.category" in statement:
            statements.append("feedback")

    with database.SessionLocal() as session:
        event.listen(session, "after_commit", lambda _session: statements.append("commit"))
        event.listen(storage_db, "before_cursor_execute", trace)
        try:
            score_answer(question["id"], 0.5, session)
        finally:
            event.remove(storage_db, "before_cursor_execute", trace)
    assert statements == ["claim", "insert", "feedback", "commit"]
    assert len(set(connections)) == 1


def test_feedback_keeps_history_and_scoring_formula():
    question = issue_question()
    with database.SessionLocal() as session:
        previous = TrainerAnswer(
            category=question["category"],
            difficulty=question["difficulty"],
            answer=0.25,
            true_equity=0.5,
            absolute_error=0.25,
            score=0,
        )
        session.add(previous)
        session.commit()
        previous_id = previous.id
        actual = session.get(TrainerQuestion, question["id"]).true_equity
        result = score_answer(question["id"], 0.5, session)
        error = abs(0.5 - actual)
        assert result["true_equity"] == actual
        assert result["absolute_error"] == error
        assert result["score"] == 100 * max(0.0, 1 - (error / 0.25) ** 2)
        assert result["weaknesses"] == [
            {
                "category": question["category"],
                "average_error": (0.25 + error) / 2,
                "answers": 2,
            }
        ]
        session.expire_all()
        preserved = session.get(TrainerAnswer, previous_id)
        assert (preserved.answer, preserved.true_equity, preserved.absolute_error) == (
            0.25,
            0.5,
            0.25,
        )


def test_concurrent_retry_after_feedback_failure_still_scores_once(storage_db):
    question = issue_question()
    failed = False
    lock = Lock()

    def fail_once(_conn, _cursor, statement, _parameters, _context, _executemany):
        nonlocal failed
        if "GROUP BY trainer_answers.category" in statement:
            with lock:
                if not failed:
                    failed = True
                    raise OperationalError("feedback", {}, Exception("injected read failure"))

    def answer(_):
        with database.SessionLocal() as session:
            try:
                return score_answer(question["id"], 0.5, session)
            except OperationalError:
                return "read_failed"
            except ValueError:
                return "duplicate"

    event.listen(storage_db, "before_cursor_execute", fail_once)
    try:
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(answer, range(8)))
    finally:
        event.remove(storage_db, "before_cursor_execute", fail_once)
    successes = [result for result in results if isinstance(result, dict)]
    assert results.count("read_failed") == 1
    assert results.count("duplicate") == 6
    assert len(successes) == 1
    assert successes[0]["weaknesses"][0]["answers"] == 1
    with database.SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(TrainerAnswer)) == 1
        assert session.get(TrainerQuestion, question["id"]).answered_at is not None


def test_api_feedback_failure_allows_retry_of_same_question(storage_db):
    question = issue_question()
    payload = {"question_id": question["id"], "answer": 0.5}

    def fail_feedback(_conn, _cursor, statement, _parameters, _context, _executemany):
        if "GROUP BY trainer_answers.category" in statement:
            raise OperationalError("feedback", {}, Exception("injected read failure"))

    with TestClient(app, raise_server_exceptions=False) as client:
        event.listen(storage_db, "before_cursor_execute", fail_feedback)
        try:
            response = client.post("/trainer/answer", json=payload)
            assert response.status_code == 500
        finally:
            event.remove(storage_db, "before_cursor_execute", fail_feedback)
        assert client.get("/trainer/weaknesses").json() == {"weaknesses": []}
        retry = client.post("/trainer/answer", json=payload)
        assert retry.status_code == 200, retry.text
        assert retry.json()["weaknesses"][0]["answers"] == 1
        assert client.get("/trainer/weaknesses").json()["weaknesses"] == retry.json()["weaknesses"]
        assert client.post("/trainer/answer", json=payload).status_code == 422


@pytest.mark.parametrize("reverse_rows", [True, False])
def test_equal_weaknesses_have_stable_category_order(monkeypatch, reverse_rows):
    # SQL GROUP BY does not promise row order: emulate both query plans.
    rows = [("top_pair", 0.25, 1), ("combo_draw", 0.25, 3), ("set", 0.5, 2)]
    if reverse_rows:
        rows.reverse()
    with database.SessionLocal() as session:

        class QueryResult:
            def all(self):
                return rows

        monkeypatch.setattr(session, "execute", lambda _query: QueryResult())
        assert trainer.weaknesses(session) == [
            {"category": "set", "average_error": 0.5, "answers": 2},
            {"category": "combo_draw", "average_error": 0.25, "answers": 3},
            {"category": "top_pair", "average_error": 0.25, "answers": 1},
        ]
