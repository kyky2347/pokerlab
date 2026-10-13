import json
import math

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy.integrate import trapezoid

from pokerlab_api import database
from pokerlab_api.database import Experiment
from pokerlab_api.main import app
from pokerlab_api.research import bayesian_update


@pytest.mark.parametrize(
    "alpha,beta,cdf",
    [
        (1, 1, lambda x: x),
        (2, 1, lambda x: x * x),
        (1, 2, lambda x: 2 * x - x * x),
        (0.5, 0.5, lambda x: 2 * math.asin(math.sqrt(x)) / math.pi),
    ],
)
def test_bins_match_independent_closed_form_cdfs(alpha, beta, cdf):
    result = bayesian_update(alpha, beta, 0, 0, 0.95)
    distribution = result["distribution"]
    assert distribution["method"] == "beta-cdf-bins-v1"
    assert distribution["bin_count"] == len(distribution["bins"]) == 200
    assert distribution["domain"] == [0, 1]
    for row in distribution["bins"]:
        expected = cdf(row["right"]) - cdf(row["left"])
        assert row["prior_mass"] == pytest.approx(expected, abs=1e-13)
        assert row["posterior_mass"] == row["prior_mass"]
        assert row["prior_density"] * (row["right"] - row["left"]) == pytest.approx(expected)


@pytest.mark.parametrize(
    "alpha,beta,aggressive,passive",
    [
        (2, 2, 4, 3),
        (2, 2, 100000, 100000),
        (1, 1, 0, 100000),
        (1, 1, 100000, 0),
        (0.5, 0.5, 0, 0),
        (1e-300, 1e-300, 0, 0),
        (1e-300, 2, 4, 3),
        (1000, 1000, 100000, 100000),
    ],
)
def test_full_support_mass_and_density_are_finite_and_conserved(alpha, beta, aggressive, passive):
    result = bayesian_update(alpha, beta, aggressive, passive, 0.95)
    json.dumps(result, allow_nan=False)
    bins = result["distribution"]["bins"]
    assert bins[0]["left"] == 0 and bins[-1]["right"] == 1
    assert all(a["right"] == b["left"] for a, b in zip(bins[:-1], bins[1:], strict=True))
    for name in ("prior", "posterior"):
        assert math.fsum(row[f"{name}_mass"] for row in bins) == pytest.approx(1, rel=0, abs=1e-12)
        assert math.fsum(
            row[f"{name}_density"] * (row["right"] - row["left"]) for row in bins
        ) == pytest.approx(1, rel=0, abs=1e-12)
        assert all(0 <= row[f"{name}_mass"] <= 1 for row in bins)
        assert all(0 <= row[f"{name}_density"] <= 201 for row in bins)


def test_concentrated_posterior_no_longer_disappears_between_sample_points():
    result = bayesian_update(2, 2, 100000, 100000, 0.95)
    old = result["density"]
    assert trapezoid([row["posterior"] for row in old], [row["p"] for row in old]) < 0.006
    bins = result["distribution"]["bins"]
    assert math.fsum(row["posterior_mass"] for row in bins[:100]) == pytest.approx(0.5)
    assert bins[99]["posterior_mass"] + bins[100]["posterior_mass"] > 0.999


def test_upper_tail_mass_is_not_lost_to_cdf_cancellation():
    result = bayesian_update(1, 8, 0, 0, 0.95)
    last = result["distribution"]["bins"][-1]
    # Beta(1, b) has survival (1 - x)^b, even when its CDF rounds to 1.
    assert last["prior_mass"] == pytest.approx((1 - last["left"]) ** 8, rel=1e-12, abs=0)


def test_conjugacy_quantiles_and_legacy_density_are_unchanged():
    result = bayesian_update(2, 2, 4, 3, 0.95)
    assert result["prior"] == {"alpha": 2, "beta": 2, "mean": 0.5}
    assert result["posterior"] == {
        "alpha": 6,
        "beta": 5,
        "mean": 6 / 11,
        "credible_level": 0.95,
        "credible_interval": pytest.approx(
            [0.2623780766069451, 0.8129139715526015], rel=0, abs=1e-14
        ),
    }
    assert len(result["density"]) == 120
    for row in result["density"]:
        p = row["p"]
        assert row["prior"] == pytest.approx(6 * p * (1 - p))
        assert row["posterior"] == pytest.approx(1260 * p**5 * (1 - p) ** 4)


@pytest.mark.parametrize("value", [0, -1, 1001, 10**1000, math.nan, math.inf, True, "2", None])
@pytest.mark.parametrize("parameter", ["alpha", "beta"])
def test_invalid_priors_fail_at_the_domain_boundary(parameter, value):
    params = dict(alpha=2, beta=2, aggressive_actions=4, passive_actions=3, credible_level=0.95)
    params[parameter] = value
    with pytest.raises(ValueError, match="prior parameters"):
        bayesian_update(**params)


@pytest.mark.parametrize("value", [-1, 100001, 1.5, True, "4", None])
@pytest.mark.parametrize("parameter", ["aggressive_actions", "passive_actions"])
def test_counts_must_be_bounded_integers(parameter, value):
    params = dict(alpha=2, beta=2, aggressive_actions=4, passive_actions=3, credible_level=0.95)
    params[parameter] = value
    with pytest.raises(ValueError, match="action counts"):
        bayesian_update(**params)


@pytest.mark.parametrize("level", [0.5, 1, math.nan, math.inf, True, "0.95", None])
def test_invalid_credible_level_is_rejected(level):
    with pytest.raises(ValueError, match="Credible level"):
        bayesian_update(2, 2, 4, 3, level)


@pytest.mark.parametrize("method", ["cdf", "sf"])
def test_numerical_failure_is_rejected_not_silently_normalized(monkeypatch, method):
    monkeypatch.setattr(
        f"pokerlab_api.research.beta_distribution.{method}",
        lambda edges, *args: np.full_like(edges, np.nan),
    )
    with pytest.raises(ValueError, match="numerically"):
        bayesian_update(2, 2, 4, 3, 0.95)


def test_nearly_unit_credible_level_retains_both_nonzero_tails():
    level = math.nextafter(1.0, 0.0)
    low, high = bayesian_update(1, 1, 1, 1, level)["posterior"]["credible_interval"]
    assert 0 < low < high < 1
    assert low == pytest.approx(1 - high, rel=1e-7)
    # Independent Beta(2,2) CDF: 3*x^2 - 2*x^3.
    assert 3 * low**2 - 2 * low**3 == pytest.approx((1 - level) / 2, rel=1e-12, abs=0)


def test_api_stores_and_exports_complete_distribution(storage_db):
    with TestClient(app) as client:
        response = client.post(
            "/research/bayesian",
            json={
                "alpha": 2,
                "beta": 2,
                "aggressive_actions": 100000,
                "passive_actions": 100000,
            },
        )
        assert response.status_code == 200
        result = response.json()
        saved = client.get(f"/experiments/{result['experiment_id']}/export").json()
        assert saved["results"] == {k: v for k, v in result.items() if k != "experiment_id"}
        assert saved["results"]["distribution"]["method"] == "beta-cdf-bins-v1"


def test_legacy_saved_results_are_not_recomputed_or_relabelled(storage_db):
    with TestClient(app) as client:
        legacy = bayesian_update(2, 2, 4, 3, 0.95)
        legacy.pop("distribution")
        with database.SessionLocal() as db:
            record = Experiment(
                experiment_type="bayesian_opponent_model",
                parameters={
                    "alpha": 2,
                    "beta": 2,
                    "aggressive_actions": 4,
                    "passive_actions": 3,
                    "credible_level": 0.95,
                },
                results=legacy,
                seed=None,
                engine="SciPy",
                runtime_ms=0,
            )
            db.add(record)
            db.commit()
            record_id = record.id
        assert client.get(f"/experiments/{record_id}/export").json()["results"] == legacy


def test_api_numerical_failure_is_structured_and_does_not_persist(monkeypatch):
    with TestClient(app) as client:
        monkeypatch.setattr(
            "pokerlab_api.research.beta_distribution.cdf",
            lambda edges, *args: np.full_like(edges, np.nan),
        )
        response = client.post("/research/bayesian", json={})
        assert response.status_code == 422
        assert "numerically" in response.json()["error"]["message"]
        assert response.json()["error"]["request_id"] == response.headers["x-request-id"]
        assert client.get("/experiments").json()["experiments"] == []


@pytest.mark.parametrize(
    "payload",
    [
        {"alpha": True},
        {"beta": "2"},
        {"aggressive_actions": 4.0},
        {"passive_actions": False},
        {"credible_level": "0.95"},
    ],
)
def test_api_rejects_coercible_but_ambiguous_numeric_inputs(payload):
    with TestClient(app) as client:
        response = client.post("/research/bayesian", json=payload)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "request_validation_error"
        assert client.get("/experiments").json()["experiments"] == []
