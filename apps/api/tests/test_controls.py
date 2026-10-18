"""Reject ambiguous experiment controls before computation or durable writes."""

import copy
import json
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from pokerlab_api import database, main
from pokerlab_api.cfr import KuhnPokerCFR, RiverCFRSolver
from pokerlab_api.database import Experiment, SolverJob, TrainerAnswer, TrainerQuestion
from pokerlab_api.domain import parse_cards
from pokerlab_api.engine import PythonPokerEngine, RustPokerEngine
from pokerlab_api.range_equity import calculate_range_equity
from pokerlab_api.research import compare_agents
from pokerlab_api.trainer import create_question

HERO = tuple(parse_cards(["As", "Ks"]))
VILLAIN = tuple(parse_cards(["Qh", "Qd"]))
BOARD = tuple(parse_cards(["Js", "8s", "2c", "3d", "4h"]))
FIXED = {"hero": ["As", "Ks"], "villain": ["Qh", "Qd"], "board": list(map(str, BOARD))}
RANGES = {"hero_range": {"AA": 1}, "villain_range": {"KK": 1}, "board": FIXED["board"]}
SOLVER = {
    "board": FIXED["board"],
    "oop_range": {"AA": 1},
    "ip_range": {"KK": 1},
    "iterations": 100,
}

CONTROLS = [
    ("/equity/monte-carlo", FIXED, "seed", 7),
    ("/equity/monte-carlo", FIXED, "samples", 100),
    ("/research/monte-carlo", FIXED, "seed", 7),
    ("/research/monte-carlo", FIXED, "samples", 100),
    ("/range/equity", RANGES, "seed", 7),
    ("/range/equity", RANGES, "samples", 100),
    ("/trainer/question", {}, "seed", 7),
    ("/research/agents", {"episodes": 100}, "seed", 7),
    ("/research/agents", {}, "episodes", 100),
    ("/solver/jobs", SOLVER, "iterations", 100),
]


def unexpected_work(*_args, **_kwargs):
    pytest.fail("Invalid controls must not start computation, query history or acquire capacity")


@pytest.mark.parametrize("endpoint,payload,field,valid", CONTROLS)
def test_api_rejects_coercion_before_computation_and_storage(
    storage_db, monkeypatch, endpoint, payload, field, valid
):
    with TestClient(main.app) as client:
        monkeypatch.setattr(main.app.state.engine, "monte_carlo", unexpected_work)
        monkeypatch.setattr(main, "calculate_range_equity", unexpected_work)
        monkeypatch.setattr(main, "compare_agents", unexpected_work)
        monkeypatch.setattr(main, "create_question", unexpected_work)
        monkeypatch.setattr(main, "RiverCFRSolver", unexpected_work)
        monkeypatch.setattr(main.solver_slots, "acquire", unexpected_work)
        invalid = [True, False, None, str(valid), float(valid), valid + 0.5, [], {}, -1, 2**63]
        for value in invalid:
            response = client.post(endpoint, json={**payload, field: value})
            assert response.status_code == 422, (field, value, response.text)
            error = response.json()["error"]
            assert error["code"] == "request_validation_error"
            assert error["request_id"] == response.headers["x-request-id"]
            assert any(detail["location"] == f"body.{field}" for detail in error["details"])
        with database.SessionLocal() as session:
            for model in (Experiment, SolverJob, TrainerQuestion, TrainerAnswer):
                assert session.scalar(select(func.count()).select_from(model)) == 0


@pytest.mark.parametrize("literal", ["1.0", "1e0", "9007199254740993.0", "NaN", "Infinity"])
def test_raw_json_seed_rejects_float_or_nonstandard_numbers(literal):
    with TestClient(main.app) as client:
        response = client.post(
            "/trainer/question",
            content='{"seed":' + literal + "}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "request_validation_error"


@pytest.mark.parametrize(
    "seed", [True, False, None, "7", 7.0, 7.5, -1, 2**63, float("nan"), float("inf")]
)
def test_direct_seed_validation_precedes_rng_evaluation_or_database_access(seed, monkeypatch):
    monkeypatch.setattr("random.Random", unexpected_work)
    engine, session = Mock(), Mock()
    for poker in (PythonPokerEngine(), RustPokerEngine()):
        with pytest.raises(ValueError, match="Seed"):
            poker.monte_carlo(HERO, VILLAIN, BOARD, 1, seed)
    with pytest.raises(ValueError, match="Seed"):
        calculate_range_equity({"AA": 1}, {"KK": 1}, BOARD, seed, 1, unexpected_work)
    with pytest.raises(ValueError, match="Seed"):
        compare_agents(100, seed)
    with pytest.raises(ValueError, match="Seed"):
        create_question(seed, engine, session)
    assert not session.mock_calls
    assert not engine.mock_calls


@pytest.mark.parametrize(
    "count", [True, False, None, "1", 1.0, 1.5, 0, -1, float("nan"), float("inf")]
)
def test_direct_sample_counts_are_strict_even_when_range_calculation_is_exact(count, monkeypatch):
    monkeypatch.setattr("random.Random", unexpected_work)
    monkeypatch.setattr("pokerlab_api.range_equity._build_pair_table", unexpected_work)
    for engine in (PythonPokerEngine(), RustPokerEngine()):
        with pytest.raises(ValueError, match="Sample count"):
            engine.monte_carlo(HERO, VILLAIN, BOARD, count, 7)
    with pytest.raises(ValueError, match="Sample count"):
        calculate_range_equity({"AA": 1}, {"KK": 1}, BOARD, 7, count, unexpected_work)


@pytest.mark.parametrize("game", ["kuhn", "river"])
def test_invalid_iterations_do_not_mutate_an_existing_solver(game):
    solver = (
        KuhnPokerCFR()
        if game == "kuhn"
        else RiverCFRSolver(BOARD, {"AA": 1}, {"KK": 1}, 100, 100, 0.5, 1)
    )
    train = solver.train if game == "kuhn" else solver.solve
    train(1)
    original = copy.deepcopy(solver.__dict__)
    for count in (True, False, None, "1", 1.0, 1.5, 0, -1, float("nan"), float("inf")):
        with pytest.raises(ValueError, match="Solver iterations"):
            train(count)
        assert solver.__dict__ == original


@pytest.mark.parametrize("seed", [0, 2**53 + 1, 2**63 - 1])
def test_integer_seeds_round_trip_without_loss_on_all_stochastic_routes(storage_db, seed):
    with TestClient(main.app) as client:
        requests = [
            ("/equity/monte-carlo", {**FIXED, "samples": 1}),
            ("/research/monte-carlo", {**FIXED, "samples": 1}),
            ("/range/equity", {**RANGES, "samples": 100}),
            ("/research/agents", {"episodes": 100}),
        ]
        for endpoint, payload in requests:
            response = client.post(endpoint, json={**payload, "seed": seed})
            assert response.status_code == 200, response.text
            result = response.json()
            assert type(result["seed"]) is int and result["seed"] == seed
            exported = client.get(f"/experiments/{result['experiment_id']}/export")
            assert exported.status_code == 200
            assert f'"seed": {seed}' in exported.text
            saved = json.loads(exported.text)
            assert saved["seed"] == saved["parameters"]["seed"] == saved["results"]["seed"] == seed
            for field in ("samples", "episodes"):
                if field in payload:
                    assert saved["parameters"][field] == payload[field]
        response = client.post("/trainer/question", json={"seed": seed})
        assert response.status_code == 200, response.text
        question = response.json()
        assert question["seed"] == seed
        with database.SessionLocal() as session:
            assert session.get(TrainerQuestion, question["id"]).seed == seed


def test_openapi_retains_integer_types_defaults_bounds_and_episode_choices():
    schemas = main.app.openapi()["components"]["schemas"]
    for name in (
        "MonteCarloRequest",
        "RangeEquityRequest",
        "TrainerQuestionRequest",
        "AgentComparisonRequest",
    ):
        seed = schemas[name]["properties"]["seed"]
        assert seed["type"] == "integer"
        assert type(seed["maximum"]) is int
        assert (seed["minimum"], seed["maximum"], seed["default"]) == (0, 2**63 - 1, 20250902)
        assert "JSON integer" in seed["description"] and "JSON 整数" in seed["description"]
        assert str(2**63 - 1) in seed["description"]
    assert schemas["AgentComparisonRequest"]["properties"]["episodes"]["enum"] == [100, 1000, 10000]


def test_published_openapi_preserves_exact_seed_limit_and_normal_cached_metadata(monkeypatch):
    monkeypatch.setattr(main.app, "openapi_schema", None)
    with TestClient(main.app) as client:
        response = client.get("/openapi.json")
        assert response.status_code == 200
        assert '"maximum":9223372036854775807' in response.text
        document = response.json()
        assert document["info"]["title"] == main.app.title
        assert document["info"]["version"] == main.app.version
        assert "/equity/monte-carlo" in document["paths"]
        assert document == client.get("/openapi.json").json()
        assert main.app.openapi() is main.app.openapi_schema
