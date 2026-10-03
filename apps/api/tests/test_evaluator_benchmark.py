from unittest.mock import patch

import pytest

from pokerlab_api.evaluator_benchmark import run


def test_evaluator_benchmark_checks_real_results_and_reports_actual_engine():
    result = run(repeats=1, hand_count=7, samples=9)
    assert result["environment"]["engine"] == "Rust accelerated"
    assert result["environment"]["baseline_extension_sha256"] is None
    assert [row["benchmark"] for row in result["results"]] == [
        "seven_card_batch",
        "exact_flop",
        "monte_carlo",
        "turn_map",
    ]
    for row in result["results"]:
        assert row["reference_match"] is True
        assert len(row["result_sha256"]) == 64
        assert len(row["times_ms"]["candidate"]) == 1
        assert row["median_ms"]["candidate"] > 0
        assert "baseline_over_candidate" not in row


def test_evaluator_benchmark_refuses_to_report_timings_for_changed_outputs():
    with patch("pokerlab_api.evaluator_benchmark.evaluate_seven", return_value=(8, 14)):
        with pytest.raises(RuntimeError, match="disagrees with the Python reference"):
            run(repeats=1, hand_count=7, samples=9)


@pytest.mark.parametrize("parameters", [{"repeats": 0}, {"hand_count": True}, {"samples": 1.5}])
def test_evaluator_benchmark_rejects_invalid_workloads(parameters):
    with pytest.raises(ValueError, match="positive integers"):
        run(**parameters)
