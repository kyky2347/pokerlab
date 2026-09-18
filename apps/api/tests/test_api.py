from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from pokerlab_api import database, main
from pokerlab_api.main import app


def test_health_and_diagnostics():
    with TestClient(app) as client:
        assert client.get("/health").json()["status"] == "ok"
        diagnostics = client.get("/diagnostics")
        assert diagnostics.status_code == 200
        assert diagnostics.json()["engine"] in {"Python reference", "Rust accelerated"}


def test_diagnostics_reuses_startup_verification_but_checks_database_each_time():
    queries = []

    @event.listens_for(database.engine, "before_cursor_execute")
    def record_query(_conn, _cursor, statement, _parameters, _context, _executemany):
        queries.append(statement)

    with patch.object(main, "verify_kuhn", wraps=main.verify_kuhn) as verify:
        with TestClient(app) as client:
            queries.clear()
            first = client.get("/diagnostics")
            second = client.get("/diagnostics")
            assert first.status_code == second.status_code == 200
            assert first.json()["kuhn_verification"] == second.json()["kuhn_verification"]
            assert first.json()["kuhn_verification"]["passed"] is True
            assert queries.count("SELECT 1") == 2
            verify.assert_called_once_with(5_000)


@pytest.mark.parametrize(
    "endpoint", ["/range/equity", "/equity/monte-carlo", "/research/monte-carlo"]
)
def test_configured_sample_limit_applies_to_every_monte_carlo_endpoint(endpoint, monkeypatch):
    monkeypatch.setattr(main.settings, "pokerlab_max_monte_carlo", 100)
    if endpoint == "/range/equity":
        payload = {"hero_range": {"AA": 1}, "villain_range": {"KK": 1}, "samples": 101}
    else:
        payload = {"hero": ["As", "Ks"], "villain": ["Qh", "Qd"], "samples": 101}
    with TestClient(app) as client:
        response = client.post(endpoint, json=payload)
        assert response.status_code == 422
        assert "safety limit 100" in response.json()["error"]["message"]
        assert client.get("/experiments").json()["experiments"] == []


def test_equity_and_ev_endpoints():
    with TestClient(app) as client:
        equity = client.post(
            "/equity/exact",
            json={"hero": ["As", "Ks"], "villain": ["Qh", "Qd"], "board": ["Js", "8s", "2c"]},
        )
        assert equity.status_code == 200
        assert equity.json()["states"] == 990
        ev = client.post(
            "/ev/calculate",
            json={
                "pot": 100,
                "opponent_bet": 50,
                "call_size": 50,
                "hero_equity": 0.3,
                "effective_stack": 200,
            },
        )
        assert ev.status_code == 200
        assert ev.json()["required_equity"] == 0.25
        assert ev.json()["incremental_call_ev"] == 10


def test_illegal_duplicate_card_state_has_structured_error():
    with TestClient(app) as client:
        response = client.post(
            "/equity/exact",
            json={"hero": ["As", "Ks"], "villain": ["As", "Qd"], "board": ["Js", "8s", "2c"]},
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "invalid_poker_state"
        assert response.json()["error"]["request_id"] == response.headers["x-request-id"]


def test_bayesian_update_and_experiment_history():
    with TestClient(app) as client:
        result = client.post(
            "/research/bayesian",
            json={
                "alpha": 2,
                "beta": 2,
                "aggressive_actions": 4,
                "passive_actions": 3,
                "credible_level": 0.95,
            },
        )
        assert result.status_code == 200
        assert result.json()["posterior"]["alpha"] == 6
        history = client.get("/experiments")
        assert history.status_code == 200
        assert len(history.json()["experiments"]) >= 1


def test_schema_validation_errors_are_structured_and_traceable():
    with TestClient(app) as client:
        response = client.post(
            "/ev/calculate",
            headers={"x-request-id": "test-request-123"},
            json={
                "pot": 100,
                "opponent_bet": 40,
                "call_size": 50,
                "hero_equity": 0.3,
                "effective_stack": 200,
            },
        )
        assert response.status_code == 422
        assert response.headers["x-request-id"] == "test-request-123"
        assert response.json()["error"]["code"] == "request_validation_error"
        assert response.json()["error"]["request_id"] == "test-request-123"
        assert response.json()["error"]["details"]


def test_solver_rejects_collapsed_bet_abstraction_before_running():
    with TestClient(app) as client:
        response = client.post(
            "/solver/jobs",
            json={
                "board": ["Ah", "Kd", "7s", "3c", "2d"],
                "oop_range": {"AQo": 1},
                "ip_range": {"KQo": 1},
                "pot": 100,
                "effective_stack": 20,
                "bet_small": 0.5,
                "bet_large": 1,
                "iterations": 100,
            },
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "request_validation_error"
