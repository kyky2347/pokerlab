"""Range inputs must never acquire a different meaning through coercion."""

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from pokerlab_api import database, main, ranges
from pokerlab_api.cfr import RiverCFRSolver
from pokerlab_api.database import Experiment, SolverJob
from pokerlab_api.domain import Card, parse_cards
from pokerlab_api.range_equity import calculate_range_equity

BOARD = tuple(parse_cards(["Ah", "Kd", "7s", "3c", "2d"]))
RANGE_REQUEST = {
    "hero_range": {"AA": 1},
    "villain_range": {"KK": 1},
    "board": list(map(str, BOARD)),
}
SOLVER_REQUEST = {
    "oop_range": {"AA": 1},
    "ip_range": {"KK": 1},
    "board": list(map(str, BOARD)),
    "iterations": 100,
}
FIELDS = [
    ("/range/statistics", {}, "range"),
    ("/range/equity", RANGE_REQUEST, "hero_range"),
    ("/range/equity", RANGE_REQUEST, "villain_range"),
    ("/solver/jobs", SOLVER_REQUEST, "oop_range"),
    ("/solver/jobs", SOLVER_REQUEST, "ip_range"),
]


def unexpected_work(*_args, **_kwargs):
    pytest.fail("Invalid range input must not reach evaluation, solver capacity or storage")


@pytest.mark.parametrize("endpoint,payload,field", FIELDS)
def test_api_rejects_ambiguous_weights_before_work(
    storage_db, monkeypatch, endpoint, payload, field
):
    with TestClient(main.app) as client:
        monkeypatch.setattr(main, "range_statistics", unexpected_work)
        monkeypatch.setattr(main, "calculate_range_equity", unexpected_work)
        monkeypatch.setattr(main, "RiverCFRSolver", unexpected_work)
        monkeypatch.setattr(main.solver_slots, "acquire", unexpected_work)
        for value in (True, False, "0.5", "1", "NaN", None, [], {}, -0.01, 1.01):
            # A second valid class ensures False cannot hide behind an empty-range error.
            response = client.post(endpoint, json={**payload, field: {"AA": value, "QQ": 1}})
            assert response.status_code == 422, (field, value, response.text)
            error = response.json()["error"]
            assert error["code"] == "request_validation_error"
            assert error["request_id"] == response.headers["x-request-id"]
            assert any(detail["location"] == f"body.{field}.AA" for detail in error["details"])
        with database.SessionLocal() as session:
            for model in (Experiment, SolverJob):
                assert session.scalar(select(func.count()).select_from(model)) == 0


@pytest.mark.parametrize("endpoint,payload,field", FIELDS)
def test_non_finite_json_weights_are_rejected(endpoint, payload, field):
    with TestClient(main.app) as client:
        for value in (float("nan"), float("inf"), -float("inf")):
            response = client.post(
                endpoint,
                content=json.dumps({**payload, field: {"AA": value, "QQ": 1}}),
                headers={"Content-Type": "application/json"},
            )
            assert response.status_code == 422
            assert response.json()["error"]["code"] == "request_validation_error"


@pytest.mark.parametrize(
    "weight",
    [
        True,
        False,
        "0.5",
        None,
        [],
        {},
        complex(0.5),
        float("nan"),
        float("inf"),
        -0.01,
        1.01,
        10**1000,
    ],
)
def test_direct_ranges_reject_ambiguous_weights_before_evaluation(weight):
    invalid = {"AA": weight, "QQ": 1}
    for consumer in (
        lambda: ranges.expand_weighted_range(invalid),
        lambda: ranges.range_statistics(invalid),
        lambda: calculate_range_equity(invalid, {"KK": 1}, BOARD, 7, 100, unexpected_work),
        lambda: calculate_range_equity({"KK": 1}, invalid, BOARD, 7, 100, unexpected_work),
        lambda: RiverCFRSolver(BOARD, invalid, {"KK": 1}, 100, 100, 0.5, 1, unexpected_work),
        lambda: RiverCFRSolver(BOARD, {"KK": 1}, invalid, 100, 100, 0.5, 1, unexpected_work),
    ):
        with pytest.raises(ValueError, match="Range weights"):
            consumer()


@pytest.mark.parametrize("blocked", [(Card.parse("As"),) * 2, ("As",), (None,), ([],)])
@pytest.mark.parametrize("weights", [{}, {"AA": 0}, {"AA": 1}])
def test_blockers_are_unique_cards_even_for_empty_ranges(blocked, weights):
    for consumer in (ranges.expand_weighted_range, ranges.range_statistics):
        with pytest.raises(ValueError, match="[Bb]locker|Duplicate"):
            consumer(weights, iter(blocked))


@pytest.mark.parametrize("label", [None, 7, b"AA"])
def test_non_text_hand_classes_raise_a_domain_error(label):
    with pytest.raises(ValueError, match="hand class"):
        ranges.expand_weighted_range({label: 1})


def test_legal_numeric_weights_aliases_and_one_shot_blockers_preserve_order():
    weights = {"aa": 1, "kas": 0.5, "22": 0}
    original = dict(weights)
    blocked = (Card.parse("As"), Card.parse("Kd"))
    expanded = ranges.expand_weighted_range(weights, iter(blocked))
    assert [
        (tuple(map(str, combo.cards)), combo.hand_class, combo.weight) for combo in expanded
    ] == [
        (("Ac", "Ad"), "AA", 1.0),
        (("Ac", "Ah"), "AA", 1.0),
        (("Ad", "Ah"), "AA", 1.0),
        (("Ac", "Kc"), "AKs", 0.5),
        (("Ah", "Kh"), "AKs", 0.5),
    ]
    assert weights == original
    assert ranges.range_statistics(weights, iter(blocked)) == {
        "hand_classes": 2,
        "physical_combos": 10,
        "range_percent": 1000 / 1326,
        "blocker_adjusted_combos": 5,
        "weighted_combos": 4.0,
    }


def test_api_numeric_weights_remain_usable_and_saved_without_coercion(storage_db):
    with TestClient(main.app) as client:
        for weight in (0, 0.25, 1):
            response = client.post("/range/statistics", json={"range": {"AA": weight}})
            assert response.status_code == 200
            assert response.json()["weighted_combos"] == 6 * weight
        response = client.post(
            "/range/equity", json={**RANGE_REQUEST, "hero_range": {"AA": 0.5, "QQ": 0}, "seed": 7}
        )
        assert response.status_code == 200
        saved = client.get(f"/experiments/{response.json()['experiment_id']}/export").json()
        assert saved["parameters"]["hero_range"] == {"AA": 0.5, "QQ": 0.0}
        job = client.post("/solver/jobs", json={**SOLVER_REQUEST, "oop_range": {"AA": 0.5}})
        assert job.status_code == 200
        assert job.json()["status"] == "completed"


def original_expand(weights, blocked=()):
    """Frozen valid-input expansion, before strict boundary validation."""
    blocked_set = set(blocked)
    return tuple(
        ranges.WeightedCombo(cards, ranges.normalize_hand_class(label), float(weight))
        for label, weight in weights.items()
        if weight != 0
        for cards in ranges.expand_hand_class(label)
        if not blocked_set.intersection(cards)
    )


@pytest.mark.parametrize("board", [(), BOARD])
def test_valid_seeded_range_results_match_original_expansion_exactly(board):
    args = ({"AA": 0.25, "AKs": 1}, {"KK": 1, "QJs": 0.75}, board, 2**63 - 1, 100)
    actual = calculate_range_equity(*args)
    with patch("pokerlab_api.range_equity.expand_weighted_range", original_expand):
        expected = calculate_range_equity(*args)
    actual.pop("runtime_ms")
    expected.pop("runtime_ms")
    assert actual == expected


def test_valid_solver_result_matches_original_expansion_exactly():
    args = (BOARD, {"AA": 0.25, "AKs": 1}, {"KK": 1, "QJs": 0.75}, 100, 100, 0.5, 1)
    actual = RiverCFRSolver(*args).solve(20)
    with patch("pokerlab_api.cfr.expand_weighted_range", original_expand):
        expected = RiverCFRSolver(*args).solve(20)
    actual.pop("runtime_ms")
    expected.pop("runtime_ms")
    assert actual == expected
