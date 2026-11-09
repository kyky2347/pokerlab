"""Range sampling uncertainty, independent moments and stored API contracts."""

import math
import statistics
from itertools import combinations

import pytest
from fastapi.testclient import TestClient

from pokerlab_api.domain import Card, full_deck
from pokerlab_api.engine import PythonPokerEngine, RustPokerEngine
from pokerlab_api.main import app, current_engine
from pokerlab_api.range_equity import calculate_range_equity
from pokerlab_api.ranges import combo_class

UNCERTAINTY_KEYS = {
    "samples",
    "sample_variance",
    "standard_error",
    "ci_low",
    "ci_high",
    "confidence_level",
    "confidence_method",
    "confidence_scope",
}
HERO, VILLAIN = {"AA": 0.25, "AKs": 1}, {"QQ": 0.75, "KQs": 0.5}
RIVER = tuple(map(Card.parse, ("Ah", "7d", "5s", "3c", "2h")))


def assert_interval(result, samples):
    radius = math.sqrt(math.log(40) / (2 * samples))
    assert result["samples"] == result["evaluated_states"] == samples
    assert result["ci_low"] == pytest.approx(max(0, result["hero_equity"] - radius))
    assert result["ci_high"] == pytest.approx(min(1, result["hero_equity"] + radius))
    assert result["confidence_level"] == 0.95
    assert result["confidence_method"] == "hoeffding_v1"
    assert result["confidence_scope"] == "pointwise_fixed_n"


@pytest.mark.parametrize("samples", [1, 100])
@pytest.mark.parametrize("score", [0.0, 0.5, 1.0])
def test_identical_range_draws_do_not_claim_certainty(samples, score):
    result = calculate_range_equity(HERO, VILLAIN, (), 7, samples, lambda *_: score)
    assert result["hero_equity"] == score
    assert_interval(result, samples)
    assert result["ci_low"] < result["ci_high"]
    if samples == 1:
        assert (result["ci_low"], result["ci_high"]) == (0, 1)
        assert result["sample_variance"] is None
        assert result["standard_error"] is None
    else:
        assert result["sample_variance"] == result["standard_error"] == 0


@pytest.mark.parametrize("scores", [(0, 0.5, 1), (0, 0, 0.5, 1, 1), (1, 1, 1, 0.5)])
def test_range_moments_match_independent_sample_statistics_including_half_ties(scores):
    draws = iter(scores)
    result = calculate_range_equity(HERO, VILLAIN, (), 7, len(scores), lambda *_: next(draws))
    assert result["hero_equity"] == pytest.approx(statistics.mean(scores))
    assert result["sample_variance"] == pytest.approx(statistics.variance(scores))
    assert result["standard_error"] == pytest.approx(
        statistics.stdev(scores) / math.sqrt(len(scores))
    )
    assert_interval(result, len(scores))


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
def test_new_metadata_preserves_historical_weighted_seeded_outputs(engine_type):
    result = calculate_range_equity(HERO, VILLAIN, (), 7, 100, engine_type().showdown)
    # Captured from the unchanged implementation before adding uncertainty.
    expected = {
        "hero_equity": 0.66,
        "villain_equity": 0.34,
        "win": 0.66,
        "tie": 0.0,
        "lose": 0.34,
        "valid_combo_pairs": 96,
        "weighted_combo_pair_mass": 33.75,
        "evaluated_states": 100,
        "method": "monte_carlo_weighted_pairs",
        "seed": 7,
    }
    assert {key: result[key] for key in expected} == expected
    assert result["sample_variance"] == pytest.approx(statistics.variance([1] * 66 + [0] * 34))
    assert_interval(result, 100)


def test_full_ranges_still_require_sampling_on_a_complete_river():
    full_range = dict.fromkeys((combo_class(pair) for pair in combinations(full_deck(), 2)), 1)
    result = calculate_range_equity(
        full_range, full_range, RIVER, 7, 100, RustPokerEngine().showdown
    )
    assert result["valid_combo_pairs"] == math.comb(47, 2) * math.comb(45, 2)
    assert result["method"] == "monte_carlo_weighted_pairs"
    assert_interval(result, 100)


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
@pytest.mark.parametrize("board", [(), RIVER])
def test_api_persists_range_method_and_uncertainty_without_relabeling_exact(
    engine_type, board, monkeypatch, storage_db
):
    engine = engine_type()
    monkeypatch.setitem(app.dependency_overrides, current_engine, lambda: engine)
    with TestClient(app) as client:
        response = client.post(
            "/range/equity",
            json={
                "hero_range": HERO,
                "villain_range": VILLAIN,
                "board": [str(card) for card in board],
                "seed": 7,
                "samples": 100,
            },
        )
        assert response.status_code == 200
        result = response.json()
        assert result["engine"] == engine.name
        if board:
            assert result["method"] == "exact_weighted_enumeration"
            assert UNCERTAINTY_KEYS.isdisjoint(result)
        else:
            assert_interval(result, 100)
        exported = client.get(f"/experiments/{result['experiment_id']}/export")
        assert exported.status_code == 200
        saved = exported.json()["results"]
        assert saved == {key: value for key, value in result.items() if key != "experiment_id"}
