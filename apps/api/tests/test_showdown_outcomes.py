"""Reject evaluator contract failures before publishing or persisting probabilities."""

import math
import threading
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from pokerlab_api import database, main
from pokerlab_api.cfr import RiverCFRSolver
from pokerlab_api.database import Experiment, SolverJob, TrainerAnswer, TrainerQuestion
from pokerlab_api.domain import Card
from pokerlab_api.engine import EquityCounts, PythonPokerEngine, RustPokerEngine
from pokerlab_api.range_equity import calculate_range_equity

HERO = tuple(map(Card.parse, ("As", "Ks")))
VILLAIN = tuple(map(Card.parse, ("Qh", "Qd")))
BOARD = tuple(map(Card.parse, ("Js", "8s", "2c", "3d", "4h")))
INVALID = [math.nan, math.inf, -math.inf, -1, 2, 0.25, True, False, None, "1", [], {}, 1 + 0j]


@pytest.mark.parametrize("outcome", INVALID)
def test_counter_rejects_invalid_outcomes_without_mutating_counts(outcome):
    counts = EquityCounts(wins=2, ties=3, losses=4)
    with pytest.raises(RuntimeError, match="Showdown outcome"):
        counts.add(outcome)
    assert (counts.wins, counts.ties, counts.losses) == (2, 3, 4)


@pytest.mark.parametrize("outcome", [0, 0.0, -0.0, 0.5, 1, 1.0])
def test_numeric_loss_tie_and_win_keep_their_exact_meaning(outcome):
    counts = EquityCounts()
    counts.add(outcome)
    assert counts.total == 1
    assert counts.probabilities() == {
        "equity": outcome,
        "win": float(outcome == 1),
        "tie": float(outcome == 0.5),
        "lose": float(outcome == 0),
    }


@pytest.mark.parametrize("outcome", INVALID)
@pytest.mark.parametrize("board", [(), BOARD], ids=["sampled", "exact"])
def test_range_equity_stops_at_the_first_invalid_evaluation(outcome, board):
    evaluate = Mock(return_value=outcome)
    with pytest.raises(RuntimeError, match="Showdown outcome"):
        calculate_range_equity({"AA": 0.3}, {"KK": 0.7}, board, 7, 5, evaluate)
    evaluate.assert_called_once()


@pytest.mark.parametrize("outcome", INVALID)
def test_solver_never_caches_an_invalid_outcome(outcome):
    evaluate = Mock(return_value=outcome)
    solver = RiverCFRSolver(BOARD, {"AA": 1}, {"KK": 1}, 100, 100, 0.5, 1, evaluate)
    deal = solver.deals[0]
    with pytest.raises(RuntimeError, match="Showdown outcome"):
        solver._oop_terminal_utility(deal, ("check", "check"))
    assert solver._showdown_cache == {}
    # Repairing the evaluator must not find a poisoned reusable cache entry.
    evaluate.return_value = 0.5
    assert solver._oop_terminal_utility(deal, ("check", "check")) == 0
    assert evaluate.call_count == 2


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
@pytest.mark.parametrize("operation", ["exact", "cached_mc", "uncached_mc", "turn_map"])
@pytest.mark.parametrize("outcome", [True, math.nan, 0.25])
def test_fixed_hand_orchestration_rejects_invalid_scores(engine_type, operation, outcome):
    engine = engine_type()
    with patch.object(engine, "showdown", return_value=outcome) as evaluate:
        with pytest.raises(RuntimeError, match="Showdown outcome"):
            if operation == "exact":
                engine.exact_equity(HERO, VILLAIN, BOARD)
            elif operation == "turn_map":
                engine.turn_map(HERO, VILLAIN, BOARD[:3])
            else:
                engine.monte_carlo(HERO, VILLAIN, BOARD if operation == "cached_mc" else (), 5, 7)
        evaluate.assert_called_once()


@pytest.mark.parametrize("consumer", ["fixed", "weighted", "solver"])
def test_invalid_score_after_valid_draws_does_not_return_partial_results(consumer):
    engine = PythonPokerEngine()
    with patch.object(engine, "showdown", side_effect=[1.0, 0.5, 0.25]) as evaluate:
        with pytest.raises(RuntimeError, match="Showdown outcome"):
            if consumer == "fixed":
                engine.monte_carlo(HERO, VILLAIN, (), 5, 7)
            elif consumer == "weighted":
                calculate_range_equity({"AA": 1}, {"KK": 1}, (), 7, 5, engine.showdown)
            else:
                RiverCFRSolver(
                    BOARD, {"AA": 1}, {"KK": 1}, 100, 100, 0.5, 1, engine.showdown
                ).solve(1)
    assert evaluate.call_count == 3


@pytest.mark.parametrize("outcome", [True, 0.25, "private-evaluator-output"])
def test_api_failures_are_safe_durable_and_recoverable(storage_db, monkeypatch, outcome):
    engine = PythonPokerEngine()
    slots = threading.BoundedSemaphore(1)
    monkeypatch.setattr(main, "solver_slots", slots)
    fixed = {"hero": list(map(str, HERO)), "villain": list(map(str, VILLAIN))}
    requests = [
        ("/equity/exact", {**fixed, "board": list(map(str, BOARD))}),
        ("/equity/monte-carlo", {**fixed, "board": [], "samples": 5, "seed": 7}),
        ("/research/monte-carlo", {**fixed, "board": [], "samples": 5, "seed": 7}),
        ("/equity/turn-map", {**fixed, "board": list(map(str, BOARD[:3]))}),
        (
            "/range/equity",
            {
                "hero_range": {"AA": 1},
                "villain_range": {"KK": 1},
                "board": list(map(str, BOARD)),
                "samples": 100,
                "seed": 7,
            },
        ),
        ("/trainer/question", {"seed": 7}),
        (
            "/range/equity",
            {
                "hero_range": {"AA": 1},
                "villain_range": {"KK": 1},
                "board": [],
                "samples": 100,
                "seed": 7,
            },
        ),
        (
            "/solver/jobs",
            {
                "board": list(map(str, BOARD)),
                "oop_range": {"AA": 1},
                "ip_range": {"KK": 1},
                "iterations": 100,
            },
        ),
    ]
    with (
        patch.dict(main.app.dependency_overrides, {main.current_engine: lambda: engine}),
        TestClient(main.app, raise_server_exceptions=False) as client,
    ):
        with patch.object(engine, "showdown", return_value=outcome):
            for index, (path, payload) in enumerate(requests):
                response = client.post(
                    path, json=payload, headers={"x-request-id": f"invalid-outcome-{index}"}
                )
                assert response.status_code == 500
                assert response.json()["error"]["code"] == "internal_server_error"
                assert response.json()["error"]["request_id"] == f"invalid-outcome-{index}"
                assert "private-evaluator-output" not in response.text
                assert "experiment_id" not in response.json()
        with database.SessionLocal() as db:
            for table in (Experiment, TrainerQuestion, TrainerAnswer):
                assert db.scalar(select(func.count()).select_from(table)) == 0
            failed = db.scalars(select(SolverJob)).one()
            assert failed.status == "failed"
            assert failed.results == {"error_type": "InvalidShowdownOutcome"}
        assert slots.acquire(blocking=False)
        slots.release()
        # Recovery uses the original real evaluator and a fresh solver instance.
        assert client.post("/equity/exact", json=requests[0][1]).status_code == 200
        assert client.post("/trainer/question", json={"seed": 7}).status_code == 200
        recovered = client.post("/solver/jobs", json=requests[-1][1])
        assert recovered.status_code == 200
        assert recovered.json()["status"] == "completed"
        with database.SessionLocal() as db:
            assert db.scalar(select(func.count()).select_from(Experiment)) == 1
            assert db.scalar(select(func.count()).select_from(TrainerQuestion)) == 1
            assert db.scalar(select(func.count()).select_from(SolverJob)) == 2
