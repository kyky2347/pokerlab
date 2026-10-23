from concurrent.futures import ThreadPoolExecutor
from unittest.mock import call, patch

import pytest
from fastapi.testclient import TestClient

from pokerlab_api import main
from pokerlab_api.cfr import verify_kuhn
from pokerlab_api.engine import PythonPokerEngine, RustPokerEngine


@pytest.fixture(scope="module")
def expected_verification():
    return verify_kuhn(20_000)


@pytest.mark.parametrize("engine_type", [PythonPokerEngine, RustPokerEngine])
def test_solver_and_diagnostics_share_the_complete_real_startup_result(
    engine_type, expected_verification
):
    engine = engine_type()
    with (
        patch.object(main, "select_engine", return_value=engine),
        patch.object(main, "verify_kuhn", wraps=verify_kuhn) as verify,
        TestClient(main.app) as client,
    ):
        for _ in range(3):
            solver = client.get("/solver/kuhn-verification")
            diagnostics = client.get("/diagnostics")
            assert solver.status_code == diagnostics.status_code == 200
            assert solver.json() == expected_verification
            assert diagnostics.json()["kuhn_verification"] == expected_verification
            assert diagnostics.json()["engine"] == engine.name
        verify.assert_called_once_with(20_000)


def test_concurrent_verification_reads_do_not_train_or_query_storage(expected_verification):
    with TestClient(main.app) as client:
        with (
            patch.object(main, "verify_kuhn", side_effect=AssertionError("unexpected training")),
            patch("sqlalchemy.orm.Session.execute", side_effect=AssertionError("unexpected SQL")),
            ThreadPoolExecutor(max_workers=8) as executor,
        ):
            responses = list(
                executor.map(lambda _: client.get("/solver/kuhn-verification"), range(24))
            )
        assert all(response.status_code == 200 for response in responses)
        assert all(response.json() == expected_verification for response in responses)


def test_client_side_edits_cannot_change_the_shared_result(expected_verification):
    with TestClient(main.app) as client:
        first = client.get("/solver/kuhn-verification").json()
        first["strategies"]["1"]["p"] = -1
        first["passed"] = False
        assert client.get("/solver/kuhn-verification").json() == expected_verification
        assert client.get("/diagnostics").json()["kuhn_verification"] == expected_verification


def test_each_lifespan_recomputes_and_does_not_hide_a_failed_check(expected_verification):
    # A deliberately undertrained real result simulates a failing startup check.
    failed = verify_kuhn(1)
    assert failed["passed"] is False
    with patch.object(main, "verify_kuhn", side_effect=[expected_verification, failed]) as verify:
        with TestClient(main.app) as client:
            assert client.get("/solver/kuhn-verification").json() == expected_verification
        with TestClient(main.app) as client:
            assert client.get("/solver/kuhn-verification").json() == failed
            assert client.get("/diagnostics").json()["kuhn_verification"] == failed
        assert verify.call_args_list == [call(20_000), call(20_000)]


def test_startup_calculation_error_is_not_replaced_with_a_previous_success(expected_verification):
    with patch.object(main, "verify_kuhn", return_value=expected_verification):
        with TestClient(main.app):
            pass
    with patch.object(main, "verify_kuhn", side_effect=RuntimeError("self-test failed")):
        with pytest.raises(RuntimeError, match="self-test failed"), TestClient(main.app):
            pytest.fail("startup must not accept requests after a calculation error")
