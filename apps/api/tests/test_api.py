from fastapi.testclient import TestClient

from pokerlab_api.main import app


def test_health_and_diagnostics():
    with TestClient(app) as client:
        assert client.get("/health").json()["status"] == "ok"
        diagnostics = client.get("/diagnostics")
        assert diagnostics.status_code == 200
        assert diagnostics.json()["engine"] in {"Python reference", "Rust accelerated"}


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
