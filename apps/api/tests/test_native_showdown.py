"""The native bridge must preserve full-deal validity and every public result."""

import random
import sys
from itertools import combinations, permutations
from types import SimpleNamespace
from unittest.mock import patch

import poker_core_rs
import pytest
from fastapi.testclient import TestClient

from pokerlab_api import main, showdown_benchmark
from pokerlab_api.cfr import RiverCFRSolver
from pokerlab_api.domain import Card, InvalidShowdownOutcome, full_deck, parse_cards
from pokerlab_api.engine import PythonPokerEngine, RustPokerEngine, select_engine
from pokerlab_api.showdown_benchmark import LegacyRustEngine, stable_result

TOKENS = "Ah Ad Kh Kd Ac 7s 6h 3d 2c".split()
DEAL = parse_cards(TOKENS)


def native(tokens):
    return poker_core_rs.showdown(tokens[:2], tokens[2:4], tokens[4:])


@pytest.mark.parametrize("seed", [0, 7, 2**63 - 1])
def test_seeded_deals_match_python_and_original_bridge(seed):
    rng = random.Random(seed)
    python, legacy, current = PythonPokerEngine(), LegacyRustEngine(), RustPokerEngine()
    deck = full_deck()
    for _ in range(500):
        deal = tuple(rng.sample(deck, 9))
        hero, villain, board = deal[:2], deal[2:4], deal[4:]
        expected = python.showdown(hero, villain, board)
        assert (
            current.showdown(hero, villain, board)
            == legacy.showdown(hero, villain, board)
            == expected
        )
        assert current.showdown(villain, hero, board) == 1 - expected


@pytest.mark.parametrize(
    "tokens,expected",
    [
        (TOKENS, 1.0),
        ("2c 3d 4c 5d As Ks Qs Js Ts".split(), 0.5),
        ("As Kd Ah Qd Ac 9s 8h 7d 2c".split(), 1.0),
        ("As 2d Kh Kd 3c 4h 5s 9d Qc".split(), 1.0),
        ("Js Ts Ah Ad 9s 8s 7s 2d 3c".split(), 1.0),
        ("As Kd Ah Kc 2c 3d 4h 5s 9d".split(), 0.5),
        ("2c 2d Ah Kd 2h 2s 3c 4d 5h".split(), 1.0),
    ],
)
def test_kickers_wheels_quads_and_shared_board_ties(tokens, expected):
    assert native(tokens) == expected
    assert native(tokens[2:4] + tokens[:2] + tokens[4:]) == 1 - expected
    assert native([token.swapcase() for token in tokens]) == expected
    for board in permutations(tokens[4:]):
        assert native(tokens[:4] + list(board)) == expected
    for suits in permutations("cdhs"):
        translated = [
            token[0] + dict(zip("cdhs", suits, strict=True))[token[1]] for token in tokens
        ]
        assert native(translated) == expected


@pytest.mark.parametrize("first,second", list(combinations(range(9), 2)))
def test_native_boundary_rejects_all_cross_player_and_board_duplicates(first, second):
    tokens = TOKENS.copy()
    tokens[second] = tokens[first].swapcase()
    with pytest.raises(ValueError, match="unique"):
        native(tokens)


@pytest.mark.parametrize("counts", [(0, 2, 5), (1, 3, 5), (3, 1, 5), (2, 2, 4), (2, 2, 6)])
def test_native_boundary_rejects_incorrect_geometry(counts):
    hero, villain, board = counts
    tokens = list(map(str, full_deck()))
    with pytest.raises(ValueError, match="two cards per player and five board"):
        poker_core_rs.showdown(
            tokens[:hero],
            tokens[hero : hero + villain],
            tokens[hero + villain : hero + villain + board],
        )


@pytest.mark.parametrize("position", [0, 2, 4])
@pytest.mark.parametrize("token", ["", "A", "10s", "Asx", "Xs", "Ax", "Ａs", "A♠", None, 7])
def test_native_boundary_rejects_malformed_tokens(position, token):
    tokens = TOKENS.copy()
    tokens[position] = token
    with pytest.raises((TypeError, ValueError)):
        native(tokens)


def test_bridge_uses_one_native_call_and_formats_each_of_nine_cards_once(monkeypatch):
    engine = RustPokerEngine()
    formatted = []
    original = Card.__str__

    def record(card):
        formatted.append(card)
        return original(card)

    monkeypatch.setattr(Card, "__str__", record)
    with (
        patch.object(poker_core_rs, "showdown", wraps=poker_core_rs.showdown) as bridge,
        patch.object(poker_core_rs, "evaluate_seven", side_effect=AssertionError("legacy call")),
    ):
        assert engine.showdown(DEAL[:2], DEAL[2:4], DEAL[4:]) == 1.0
    assert bridge.call_count == 1
    assert formatted == list(DEAL)


def test_old_extensions_keep_actual_rust_execution(monkeypatch):
    legacy = SimpleNamespace(deck=poker_core_rs.deck, evaluate_seven=poker_core_rs.evaluate_seven)
    monkeypatch.setitem(sys.modules, "poker_core_rs", legacy)
    engine = select_engine()
    assert type(engine) is RustPokerEngine
    with patch.object(legacy, "evaluate_seven", wraps=legacy.evaluate_seven) as evaluate:
        assert engine.showdown(DEAL[:2], DEAL[2:4], DEAL[4:]) == 1.0
    assert evaluate.call_count == 2


@pytest.mark.parametrize("bad", [True, None, float("nan"), float("inf"), 0.25, "1", 0.0, 0.5])
def test_bad_native_startup_checks_select_python_and_report_it(monkeypatch, bad):
    module = SimpleNamespace(
        deck=poker_core_rs.deck,
        evaluate_seven=poker_core_rs.evaluate_seven,
        showdown=lambda *_: bad,
    )
    monkeypatch.setitem(sys.modules, "poker_core_rs", module)
    engine = select_engine()
    assert type(engine) is PythonPokerEngine
    with TestClient(main.app) as client:
        assert client.get("/diagnostics").json()["engine"] == "Python reference"


@pytest.mark.parametrize("bad", [True, None, float("nan"), 0.25])
def test_invalid_native_output_after_startup_is_not_classified_as_a_loss(bad):
    engine = RustPokerEngine()
    with patch.object(poker_core_rs, "showdown", return_value=bad):
        with pytest.raises(InvalidShowdownOutcome):
            engine.showdown(DEAL[:2], DEAL[2:4], DEAL[4:])


def test_complete_solver_output_preserves_original_bridge():
    results = [
        RiverCFRSolver(
            DEAL[4:],
            {"AA": 0.25, "AKs": 1},
            {"KK": 1, "QJs": 0.75},
            100,
            100,
            0.5,
            1,
            engine.showdown,
        ).solve(100)
        for engine in (PythonPokerEngine(), LegacyRustEngine(), RustPokerEngine())
    ]
    assert stable_result(results[0]) == stable_result(results[1]) == stable_result(results[2])


def test_api_native_equity_and_original_export_match_reference(storage_db):
    hero, villain, board = DEAL[:2], DEAL[2:4], DEAL[4:]
    expected = stable_result(PythonPokerEngine().exact_equity(hero, villain, board))
    with TestClient(main.app) as client:
        main.app.state.engine = RustPokerEngine()
        with patch.object(poker_core_rs, "showdown", wraps=poker_core_rs.showdown) as bridge:
            response = client.post(
                "/equity/exact",
                json={"hero": TOKENS[:2], "villain": TOKENS[2:4], "board": TOKENS[4:]},
            )
        assert response.status_code == 200
        assert bridge.call_count == 1
        result = response.json()
        assert result["engine"] == "Rust accelerated"
        experiment_id = result.pop("experiment_id")
        assert stable_result(result) == expected
        exported = client.get(f"/experiments/{experiment_id}/export").json()
        assert exported["engine"] == "Rust accelerated"
        assert stable_result(exported["results"]) == expected


def test_benchmark_checks_complete_results_for_both_bridges():
    report = showdown_benchmark.run(repeats=1, deals=5, samples=9)
    assert report["environment"]["engine"] == "Rust accelerated"
    assert len(report["results"]) == 6
    for row in report["results"]:
        assert row["complete_result_match"] is True
        assert len(row["result_sha256"]) == 64
        assert all(len(values) == 1 for values in row["times_ms"].values())


@pytest.mark.parametrize("field", ["repeats", "deals", "samples", "seed"])
def test_benchmark_rejects_invalid_controls(field):
    with pytest.raises(ValueError):
        showdown_benchmark.run(**{field: True})


def test_benchmark_fails_instead_of_reporting_changed_results(monkeypatch):
    monkeypatch.setattr(LegacyRustEngine, "showdown", lambda *_: 0.25)
    with pytest.raises(RuntimeError, match="differs from the Python reference"):
        showdown_benchmark.run(repeats=1, deals=5, samples=9)


def test_benchmark_requires_the_new_native_function(monkeypatch):
    monkeypatch.delattr(poker_core_rs, "showdown")
    with pytest.raises(RuntimeError, match="Rebuild"):
        showdown_benchmark.run(repeats=1, deals=5, samples=9)
