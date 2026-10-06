import pytest

from pokerlab_api import range_pair_benchmark
from pokerlab_api.domain import Card


def test_benchmark_checks_complete_table_and_reports_separate_measurements():
    board = tuple(map(Card.parse, ("2c", "7d", "9h")))
    result = range_pair_benchmark.measure({"AA": 0.3}, {"KK": 0.7}, board, repeats=2)
    assert result["valid_combo_pairs"] == 36
    assert result["complete_table_and_cumulative_weights_match"] is True
    assert result["inputs"]["board"] == ["2c", "7d", "9h"]
    for variant in ("legacy", "compact"):
        assert len(result["timings_ms"][variant]) == 2
        assert result["peak_traced_python_bytes"][variant] > 0


@pytest.mark.parametrize("repeats", [0, -1, True, 1.5])
def test_benchmark_rejects_invalid_repeats(repeats):
    with pytest.raises(ValueError, match="positive integer"):
        range_pair_benchmark.measure({"AA": 1}, {"KK": 1}, (), repeats=repeats)


def test_benchmark_fails_on_a_mismatched_table(monkeypatch):
    original = range_pair_benchmark._compact

    def corrupt(*args):
        codes, weights, cumulative, mass = original(*args)
        codes[0] = codes[1]
        return codes, weights, cumulative, mass

    monkeypatch.setattr(range_pair_benchmark, "_compact", corrupt)
    with pytest.raises(ValueError, match="mismatch"):
        range_pair_benchmark.measure({"AA": 1}, {"KK": 1}, (), repeats=1)
