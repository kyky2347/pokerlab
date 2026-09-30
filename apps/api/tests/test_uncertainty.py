"""Deterministic checks of finite-sample equity uncertainty, not flaky coverage runs."""

import math
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from pokerlab_api.domain import Card
from pokerlab_api.engine import PythonPokerEngine, RustPokerEngine
from pokerlab_api.main import app
from pokerlab_api.uncertainty import hoeffding_interval


def cards(tokens):
    return tuple(map(Card.parse, tokens.split()))


HERO, VILLAIN, FLOP = cards("As Ks"), cards("Qh Qd"), cards("Js 8s 2c")


@pytest.mark.parametrize("samples", [1, 2, 5, 20, 100])
@pytest.mark.parametrize(
    "probabilities", [(1, 0, 0), (0, 1, 0), (0.01, 0, 0.99), (0.2, 0.5, 0.3), (0.5, 0, 0.5)]
)
def test_exact_multinomial_coverage_at_fixed_sample_sizes(samples, probabilities):
    """Enumerate every (wins, ties, losses) count; no random pass/fail threshold."""
    p_win, p_tie, p_lose = probabilities
    truth = p_win + 0.5 * p_tie
    failure_mass = total_mass = 0.0
    for wins in range(samples + 1):
        for ties in range(samples - wins + 1):
            losses = samples - wins - ties
            mass = (
                math.comb(samples, wins)
                * math.comb(samples - wins, ties)
                * p_win**wins
                * p_tie**ties
                * p_lose**losses
            )
            total_mass += mass
            low, high = hoeffding_interval((wins + 0.5 * ties) / samples, samples)
            if not low <= truth <= high:
                failure_mass += mass
    assert total_mass == pytest.approx(1)
    assert failure_mass <= 0.05 + 1e-12


@pytest.mark.parametrize("samples", [0, -1, 0.5, True])
def test_interval_rejects_invalid_sample_counts(samples):
    with pytest.raises(ValueError, match="positive integer"):
        hoeffding_interval(0.5, samples)


@pytest.mark.parametrize("mean", [-0.1, 1.1, math.nan, math.inf, -math.inf])
def test_interval_rejects_invalid_equity_means(mean):
    with pytest.raises(ValueError, match="finite"):
        hoeffding_interval(mean, 100)


def test_unclipped_interval_radius_has_inverse_square_root_scaling():
    low, high = hoeffding_interval(0.5, 100)
    narrower_low, narrower_high = hoeffding_interval(0.5, 400)
    assert (high - low) / (narrower_high - narrower_low) == pytest.approx(2)


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
def test_one_sample_does_not_claim_certainty(engine_type):
    result = engine_type().monte_carlo(HERO, VILLAIN, FLOP, 1, 7)
    assert (result["ci_low"], result["ci_high"]) == (0, 1)
    assert result["sample_variance"] is None
    assert result["standard_error"] is None
    assert result["convergence"] == [
        {"samples": 1, "estimate": result["equity"], "ci_low": 0, "ci_high": 1}
    ]


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
@pytest.mark.parametrize("outcome", [0.0, 0.5, 1.0])
def test_identical_observations_do_not_collapse_interval(engine_type, outcome):
    engine = engine_type()
    with patch.object(engine, "showdown", return_value=outcome):
        result = engine.monte_carlo(HERO, VILLAIN, FLOP, 100, 7)
    radius = math.sqrt(math.log(40) / 200)
    assert result["equity"] == outcome
    assert result["standard_error"] == 0
    assert result["ci_low"] == pytest.approx(max(0, outcome - radius))
    assert result["ci_high"] == pytest.approx(min(1, outcome + radius))
    assert all(point["ci_low"] < point["ci_high"] for point in result["convergence"])


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
def test_seeded_samples_and_moments_preserve_the_previous_engine_contract(engine_type):
    result = engine_type().monte_carlo(HERO, VILLAIN, FLOP, 100, 7)
    assert {key: result[key] for key in ("equity", "win", "tie", "lose")} == {
        "equity": 0.54,
        "win": 0.54,
        "tie": 0,
        "lose": 0.46,
    }
    assert result["sample_variance"] == pytest.approx(0.25090909090909086)
    assert result["standard_error"] == pytest.approx(0.05009082659620331)
    assert {
        p["samples"]: p["estimate"]
        for p in result["convergence"]
        if p["samples"] in (1, 10, 50, 100)
    } == {1: 0, 10: 0.3, 50: 0.44, 100: 0.54}
    for point in result["convergence"]:
        radius = math.sqrt(math.log(40) / (2 * point["samples"]))
        assert point["ci_low"] == pytest.approx(max(0, point["estimate"] - radius))
        assert point["ci_high"] == pytest.approx(min(1, point["estimate"] + radius))
    assert result["convergence"][-1]["ci_low"] == result["ci_low"]
    assert result["convergence"][-1]["ci_high"] == result["ci_high"]
    assert result["confidence_method"] == "hoeffding_v1"
    assert result["confidence_level"] == 0.95
    assert result["confidence_scope"] == "pointwise_fixed_n"


@pytest.mark.parametrize("endpoint", ["/equity/monte-carlo", "/research/monte-carlo"])
def test_api_preserves_uncertainty_method_and_null_moments_in_saved_exports(endpoint):
    with TestClient(app) as client:
        response = client.post(
            endpoint,
            json={
                "hero": ["As", "Ks"],
                "villain": ["Qh", "Qd"],
                "board": ["Js", "8s", "2c"],
                "samples": 1,
                "seed": 7,
            },
        )
        assert response.status_code == 200
        result = response.json()
        assert result["confidence_method"] == "hoeffding_v1"
        assert result["confidence_level"] == 0.95
        assert result["confidence_scope"] == "pointwise_fixed_n"
        assert (result["ci_low"], result["ci_high"]) == (0, 1)
        assert result["standard_error"] is None
        saved = client.get(f"/experiments/{result['experiment_id']}/export").json()["results"]
        for key in (
            "ci_low",
            "ci_high",
            "standard_error",
            "sample_variance",
            "confidence_method",
            "confidence_level",
            "confidence_scope",
            "convergence",
        ):
            assert saved[key] == result[key]
