import math
import random
import statistics

import pytest
from fastapi.testclient import TestClient
from scipy.stats import t

from pokerlab_api.main import app
from pokerlab_api.research import compare_agents


def test_benchmark_names_match_real_policies_and_preserve_seeded_results():
    result = compare_agents(100, 7)
    expected = {
        "RandomAgent": (25.15852495607063, 39.08872554773805, 3132.4775813317383),
        "TightThresholdAgent": (64.14283581146505, 0.10441469234363636, 3997.8392571773484),
        "PotOddsAgent": (64.24725050380869, 0.0, 3984.8396978012734),
        "SoftmaxAgent": (64.11677494909927, 0.13047555470941036, 4001.952440209837),
    }
    assert result["benchmark_version"] == "river-call-fold-v2"
    assert set(result["methodology"]["policies"]) == set(expected)
    for row in result["agents"]:
        assert (row["average_ev"], row["decision_regret"], row["variance"]) == pytest.approx(
            expected[row["agent"]]
        )


@pytest.mark.parametrize("seed", [0, 7, 20250902, 2**63 - 1])
def test_results_are_reproducible_finite_and_oracle_dominates(seed):
    first, second = compare_agents(100, seed), compare_agents(100, seed)
    first.pop("runtime_ms")
    second.pop("runtime_ms")
    assert first == second
    oracle = next(row for row in first["agents"] if row["agent"] == "PotOddsAgent")
    assert oracle["decision_regret"] == 0
    for row in first["agents"]:
        assert all(math.isfinite(value) for key, value in row.items() if key != "agent")
        assert row["average_ev"] <= oracle["average_ev"] + 1e-12
        assert row["average_ev"] + row["decision_regret"] == pytest.approx(oracle["average_ev"])
        assert 0 <= row["call_frequency"] <= 1
        assert row["ci_low"] <= row["average_ev"] <= row["ci_high"]


def test_statistics_match_an_independent_batch_reference():
    rng = random.Random(17)
    values = []
    calls = 0
    for _ in range(100):
        pot, call_fraction, equity = rng.uniform(40, 200), rng.random(), rng.random()
        call = 10 + (pot - 10) * call_fraction
        take_call = rng.random() < 0.5
        rng.random()  # Shared legacy stream also samples the logistic policy.
        calls += take_call
        values.append(equity * (pot + 2 * call) - call if take_call else 0.0)
    result = compare_agents(100, 17)["agents"][0]
    mean = statistics.mean(values)
    se = statistics.stdev(values) / math.sqrt(len(values))
    interval = t.interval(0.95, df=99, loc=mean, scale=se)
    assert result["average_ev"] == pytest.approx(mean)
    assert result["variance"] == pytest.approx(statistics.pvariance(values))
    assert result["standard_error"] == pytest.approx(se)
    assert (result["ci_low"], result["ci_high"]) == pytest.approx(interval)
    assert result["call_frequency"] == calls / 100


def test_policies_follow_their_declared_thresholds(monkeypatch):
    class FixedScenarios:
        def __init__(self, _seed):
            self.amounts = iter([100, 50] * 4)
            self.draws = iter(
                value for equity in (0.1, 0.25, 0.27, 0.3) for value in (equity, 0.4, 0.6)
            )

        def uniform(self, _low, _high):
            return next(self.amounts)

        def random(self):
            return next(self.draws)

    monkeypatch.setattr("pokerlab_api.research.random.Random", FixedScenarios)
    rows = {row["agent"]: row for row in compare_agents(4, 7)["agents"]}
    assert rows["RandomAgent"]["average_ev"] == pytest.approx(-4)
    assert rows["PotOddsAgent"]["average_ev"] == pytest.approx(3.5)
    assert rows["TightThresholdAgent"]["average_ev"] == pytest.approx(2.5)
    assert rows["SoftmaxAgent"]["average_ev"] == pytest.approx(3.5)
    assert rows["PotOddsAgent"]["call_frequency"] == 0.75
    assert rows["TightThresholdAgent"]["call_frequency"] == 0.25


@pytest.mark.parametrize("episodes", [0, 1, -1, 10001, 1.5, True])
def test_invalid_batch_size_is_rejected(episodes):
    with pytest.raises(ValueError, match="Episode count"):
        compare_agents(episodes, 7)


@pytest.mark.parametrize("seed", [-1, 2**63, 1.5, True])
def test_invalid_seed_is_rejected(seed):
    with pytest.raises(ValueError, match="Seed"):
        compare_agents(100, seed)


def test_minimum_batch_has_defined_uncertainty():
    assert all(math.isfinite(row["ci_high"]) for row in compare_agents(2, 7)["agents"])


def test_api_persists_complete_reproducible_methodology():
    with TestClient(app) as client:
        response = client.post("/research/agents", json={"episodes": 100, "seed": 2**63 - 1})
        assert response.status_code == 200
        result = response.json()
        saved = client.get(f"/experiments/{result['experiment_id']}").json()
        assert saved["seed"] == 2**63 - 1
        assert saved["parameters"] == {"episodes": 100, "seed": 2**63 - 1}
        assert saved["results"] == {
            key: value for key, value in result.items() if key != "experiment_id"
        }
        assert result["confidence_level"] == 0.95
        assert "not realized winnings" in result["methodology"]["limitations"]
