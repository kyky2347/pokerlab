"""Decision inputs must not silently become different probabilities or chip amounts."""

import json
from decimal import Decimal
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select

from pokerlab_api import database, main
from pokerlab_api.cfr import RiverCFRSolver
from pokerlab_api.database import Experiment, SolverJob, TrainerAnswer, TrainerQuestion
from pokerlab_api.domain import parse_cards
from pokerlab_api.engine import PythonPokerEngine, RustPokerEngine
from pokerlab_api.trainer import create_question, score_answer

EV = {
    "pot": 105,
    "opponent_bet": 50,
    "call_size": 50,
    "hero_equity": 0.305,
    "effective_stack": 100,
}
SOLVER = {
    "board": ["Ah", "Kd", "7s", "3c", "2d"],
    "oop_range": {"AA": 0.25, "AKs": 1},
    "ip_range": {"KK": 1, "QJs": 0.75},
    "pot": 100,
    "effective_stack": 100,
    "bet_small": 0.5,
    "bet_large": 1,
    "iterations": 100,
}
FIELDS = [
    *(("/ev/calculate", EV, field) for field in EV),
    *(
        ("/solver/jobs", SOLVER, field)
        for field in ("pot", "effective_stack", "bet_small", "bet_large")
    ),
    ("/trainer/answer", {"question_id": "unused", "answer": 0.5}, "answer"),
]
INVALID = (True, False, "0.5", "1", "NaN", None, [], {}, float("nan"), float("inf"), -float("inf"))


def unexpected_work(*_args, **_kwargs):
    pytest.fail("Invalid input reached scoring, solver capacity, evaluation or storage")


@pytest.mark.parametrize("endpoint,payload,field", FIELDS)
def test_ambiguous_numbers_fail_at_http_boundary(storage_db, monkeypatch, endpoint, payload, field):
    with TestClient(main.app, raise_server_exceptions=False) as client:
        monkeypatch.setattr(main, "score_answer", unexpected_work)
        monkeypatch.setattr(main, "RiverCFRSolver", unexpected_work)
        monkeypatch.setattr(main.solver_slots, "acquire", unexpected_work)
        for value in INVALID:
            response = client.post(
                endpoint,
                content=json.dumps({**payload, field: value}),
                headers={"Content-Type": "application/json"},
            )
            assert response.status_code == 422, (field, value, response.text)
            error = response.json()["error"]
            assert error["code"] == "request_validation_error"
            assert error["request_id"] == response.headers["x-request-id"]
            assert "请求参数校验失败" in error["message"]
            assert any(detail["location"] == f"body.{field}" for detail in error["details"])
        with database.SessionLocal() as session:
            for model in (Experiment, SolverJob, TrainerAnswer, TrainerQuestion):
                assert session.scalar(select(func.count()).select_from(model)) == 0


@pytest.mark.parametrize("answer", [*INVALID, -0.01, 1.01, 10**1000, complex(0.5), Decimal("0.5")])
def test_direct_scoring_rejects_invalid_numbers_without_touching_session(answer):
    session = Mock()
    with pytest.raises(ValueError, match="between 0 and 1"):
        score_answer("unused", answer, session)
    assert session.mock_calls == []


def test_bad_answers_leave_real_question_available_for_a_single_corrected_submission(storage_db):
    with TestClient(main.app) as client:
        question = client.post("/trainer/question", json={"seed": 7}).json()
        with database.SessionLocal() as session:
            true_equity = session.get(TrainerQuestion, question["id"]).true_equity

        def forbid_database(*_args, **_kwargs):
            pytest.fail("Invalid answer queried or changed durable training state")

        event.listen(storage_db, "before_cursor_execute", forbid_database)
        try:
            for value in (*INVALID, -0.01, 1.01):
                response = client.post(
                    "/trainer/answer",
                    content=json.dumps({"question_id": question["id"], "answer": value}),
                    headers={"Content-Type": "application/json"},
                )
                assert response.status_code == 422
        finally:
            event.remove(storage_db, "before_cursor_execute", forbid_database)
        with database.SessionLocal() as session:
            assert session.get(TrainerQuestion, question["id"]).answered_at is None
            assert session.scalar(select(func.count()).select_from(TrainerAnswer)) == 0
        answer = client.post(
            "/trainer/answer", json={"question_id": question["id"], "answer": true_equity}
        )
        assert answer.status_code == 200
        assert answer.json()["score"] == 100
        assert answer.json()["weaknesses"][0]["answers"] == 1
        assert (
            client.post(
                "/trainer/answer", json={"question_id": question["id"], "answer": 0}
            ).status_code
            == 422
        )


@pytest.mark.parametrize("answer", [0, 0.0, 0.375, 1, 1.0])
def test_valid_direct_and_http_answers_keep_scoring_and_history(storage_db, answer):
    with TestClient(main.app) as client:
        with database.SessionLocal() as session:
            first = create_question(7, PythonPokerEngine(), session)
            second = create_question(7, PythonPokerEngine(), session)
            truth = session.get(TrainerQuestion, first["id"]).true_equity
            direct = score_answer(first["id"], answer, session)
        response = client.post(
            "/trainer/answer", json={"question_id": second["id"], "answer": answer}
        )
        assert response.status_code == 200
        actual = response.json()
        error = abs(answer - truth)
        for result in (direct, actual):
            assert result["answer"] == answer
            assert result["true_equity"] == truth
            assert result["absolute_error"] == error
            assert result["score"] == 100 * max(0.0, 1 - (error / 0.25) ** 2)
        assert actual["weaknesses"][0]["answers"] == 2


def test_numeric_ev_requests_preserve_entire_curve_and_geometry():
    cases = [
        EV,
        {**EV, "opponent_bet": 0, "call_size": 0, "hero_equity": 0},
        {**EV, "hero_equity": 1},
        {**EV, "hero_equity": 50 / 205},
        {
            **EV,
            "pot": 1_000_000,
            "opponent_bet": 1_000_000,
            "call_size": 1_000_000,
            "effective_stack": 1_000_000,
        },
    ]
    with TestClient(main.app) as client:
        for payload in cases:
            response = client.post("/ev/calculate", json=payload)
            assert response.status_code == 200
            total = payload["pot"] + payload["opponent_bet"] + payload["call_size"]
            ev = payload["hero_equity"] * total - payload["call_size"]
            assert response.json() == {
                "final_pot_after_call": total,
                "required_equity": payload["call_size"] / total,
                "pot_odds": payload["call_size"] / total,
                "incremental_call_ev": ev,
                "decision": "call" if ev > 1e-9 else "fold" if ev < -1e-9 else "break_even",
                "formula": "EV(call) = equity × final pot after call − call size",
                "curve": [
                    {"equity": i / 100, "ev": i / 100 * total - payload["call_size"]}
                    for i in range(101)
                ],
            }
        for changes in ({"call_size": 51}, {"opponent_bet": 101}, {"hero_equity": 1.01}):
            assert client.post("/ev/calculate", json={**EV, **changes}).status_code == 422
        # Numeric syntax may differ for these fields, unlike integer-only seeds.
        numeric_forms = client.post(
            "/ev/calculate",
            content='{"pot":1.05e2,"opponent_bet":50.0,"call_size":5e1,'
            '"hero_equity":3.05e-1,"effective_stack":1e2}',
            headers={"Content-Type": "application/json"},
        )
        assert numeric_forms.status_code == 200
        assert numeric_forms.json() == client.post("/ev/calculate", json=EV).json()


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
def test_numeric_solver_request_matches_real_engine_and_durable_result(storage_db, engine_type):
    engine = engine_type()
    with TestClient(main.app) as client:
        main.app.state.engine = engine
        expected = RiverCFRSolver(
            tuple(parse_cards(SOLVER["board"])),
            SOLVER["oop_range"],
            SOLVER["ip_range"],
            SOLVER["pot"],
            SOLVER["effective_stack"],
            SOLVER["bet_small"],
            SOLVER["bet_large"],
            engine.showdown,
        ).solve(SOLVER["iterations"])
        response = client.post("/solver/jobs", json=SOLVER)
        assert response.status_code == 200
        result = response.json()
        stored = client.get(f"/solver/jobs/{result['id']}").json()
        assert result["status"] == stored["status"] == "completed"
        assert result["engine"] == stored["results"]["engine"] == engine.name
        assert stored["parameters"] == SOLVER
        for key, value in expected.items():
            if key != "runtime_ms":
                assert result[key] == stored["results"][key] == value


def test_openapi_describes_numeric_contract_in_both_languages():
    with TestClient(main.app) as client:
        schemas = client.get("/openapi.json").json()["components"]["schemas"]
        for name, fields in (
            ("EVRequest", EV),
            ("SolverRequest", ("pot", "effective_stack", "bet_small", "bet_large")),
            ("TrainerAnswerRequest", ("answer",)),
        ):
            for field in fields:
                prop = schemas[name]["properties"][field]
                assert prop["type"] == "number"
                assert "booleans and strings are rejected" in prop["description"]
                assert "不接受布尔值或字符串" in prop["description"]
        assert schemas["SolverRequest"]["properties"]["pot"]["default"] == 100
        assert schemas["SolverRequest"]["properties"]["bet_large"]["maximum"] == 2
