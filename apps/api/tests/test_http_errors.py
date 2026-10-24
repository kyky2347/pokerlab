import json
import logging
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from uuid import UUID

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.exc import OperationalError

from pokerlab_api import main

ORIGIN = "http://localhost:3000"


def assert_trace(response, code, request_id=None):
    assert response.headers["content-type"].startswith("application/json")
    error = response.json()["error"]
    assert error["code"] == code
    assert error["request_id"] == response.headers["x-request-id"]
    if request_id is not None:
        assert error["request_id"] == request_id
    return error


def test_database_failure_is_private_traceable_and_cors_readable(storage_db, caplog):
    secret = "private-test-bind-value"

    def fail_query(*_args):
        raise OperationalError("private-test-sql", {"private": secret}, Exception(secret))

    caplog.set_level(logging.INFO, logger="pokerlab")
    with TestClient(main.app, raise_server_exceptions=False) as client:
        caplog.clear()
        event.listen(storage_db, "before_cursor_execute", fail_query)
        try:
            response = client.get(
                "/diagnostics?private=private-test-query",
                headers={"origin": ORIGIN, "x-request-id": "diagnostics-failure-1"},
            )
        finally:
            event.remove(storage_db, "before_cursor_execute", fail_query)
        assert response.status_code == 500
        error = assert_trace(response, "internal_server_error", "diagnostics-failure-1")
        assert "请求" in error["message"]
        assert response.headers["access-control-allow-origin"] == ORIGIN
        assert "x-request-id" in response.headers["access-control-expose-headers"].lower()
        assert response.headers["cache-control"] == "no-store"
        records = [record for record in caplog.records if record.name == "pokerlab"]
        events = [json.loads(record.getMessage()) for record in records]
        failures = [entry for entry in events if entry["event"] == "request_error"]
        assert len(failures) == 1
        assert failures[0]["error_type"] == "OperationalError"
        assert failures[0]["request_id"] == error["request_id"]
        assert failures[0]["path"] == "/diagnostics"
        assert any(entry.get("status") == 500 for entry in events)
        assert all(record.exc_info is None and record.stack_info is None for record in records)
        public_data = response.text + json.dumps(events)
        for private in (secret, "private-test-sql", "private-test-query"):
            assert private not in public_data
        assert client.get("/diagnostics").status_code == 200


def test_http_errors_keep_status_legacy_details_and_protocol_headers():
    with TestClient(main.app) as client:
        for path, detail in (
            ("/missing-private-path", "Not Found"),
            ("/experiments/missing", "Experiment not found"),
            ("/experiments/missing/export", "Experiment not found"),
            ("/solver/jobs/missing", "Solver job not found"),
        ):
            response = client.get(path)
            assert response.status_code == 404
            assert_trace(response, "not_found")
            assert response.json()["detail"] == detail
        response = client.post("/health")
        assert response.status_code == 405
        assert "GET" in response.headers["allow"]
        assert_trace(response, "method_not_allowed")
        with patch.object(main.solver_slots, "acquire", return_value=False):
            response = client.post(
                "/solver/jobs",
                json={
                    "board": ["Ah", "Kd", "7s", "3c", "2d"],
                    "oop_range": {"AA": 1},
                    "ip_range": {"KK": 1},
                },
            )
        assert response.status_code == 429
        assert_trace(response, "workload_limit")
        assert response.json()["detail"] == "Solver concurrency limit reached"


def test_request_ids_accept_only_bounded_safe_ascii():
    with TestClient(main.app) as client:
        for supplied in ("trace-1", "trace.A_b:123", "x" * 128):
            response = client.get("/health", headers={"x-request-id": supplied})
            assert response.headers["x-request-id"] == supplied
        generated = []
        for supplied in (
            b"",
            b" ",
            b"x" * 129,
            b"bad\r\nvalue",
            b"bad\tvalue",
            b"bad\x00value",
            b"bad\x7fvalue",
            b"\xff",
            b"private/path",
            b"<tag>",
        ):
            response = client.get("/health", headers=[(b"x-request-id", supplied)])
            request_id = response.headers["x-request-id"]
            assert UUID(request_id).version == 4
            generated.append(request_id)
        assert len(set(generated)) == len(generated)


def test_logs_use_route_templates_instead_of_private_path_parameters(caplog):
    caplog.set_level(logging.INFO, logger="pokerlab")
    with TestClient(main.app) as client:
        caplog.clear()
        client.get("/experiments/private-experiment-id?private=private-query")
        client.get("/unmatched-private-path")
        events = [
            json.loads(record.getMessage())
            for record in caplog.records
            if record.name == "pokerlab"
        ]
        assert [entry["path"] for entry in events] == [
            "/experiments/{experiment_id}",
            "<unmatched>",
        ]
        assert "private-" not in json.dumps(events)


def test_concurrent_failures_do_not_mix_request_ids_or_enable_untrusted_origins():
    def unavailable():
        raise RuntimeError("private-engine-failure")

    with (
        patch.dict(main.app.dependency_overrides, {main.current_engine: unavailable}),
        TestClient(main.app, raise_server_exceptions=False) as client,
        ThreadPoolExecutor(max_workers=8) as executor,
    ):
        ids = [f"failure-{index}" for index in range(16)]
        responses = list(
            executor.map(
                lambda request_id: client.get(
                    "/diagnostics",
                    headers={"x-request-id": request_id, "origin": "https://untrusted.invalid"},
                ),
                ids,
            )
        )
        for response, request_id in zip(responses, ids, strict=True):
            assert response.status_code == 500
            assert_trace(response, "internal_server_error", request_id)
            assert "access-control-allow-origin" not in response.headers
            assert "private-engine-failure" not in response.text


def test_explicit_server_errors_hide_details_but_keep_retry_after():
    def unavailable():
        raise HTTPException(503, detail="private-service-details", headers={"Retry-After": "5"})

    with (
        patch.dict(main.app.dependency_overrides, {main.current_engine: unavailable}),
        TestClient(main.app) as client,
    ):
        response = client.get("/diagnostics")
        assert response.status_code == 503
        assert response.headers["retry-after"] == "5"
        assert_trace(response, "internal_server_error")
        assert "private-service-details" not in response.text


def test_existing_validation_and_cors_preflight_remain_supported():
    with TestClient(main.app) as client:
        response = client.post("/equity/exact", json={})
        assert_trace(response, "request_validation_error")
        assert response.status_code == 422
        response = client.post(
            "/equity/exact", json={"hero": ["As", "Ks"], "villain": ["As", "Qd"]}
        )
        assert_trace(response, "invalid_poker_state")
        assert response.status_code == 422
        response = client.options(
            "/equity/exact",
            headers={
                "Origin": ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-request-id",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == ORIGIN


def test_openapi_documents_the_safe_server_error():
    with TestClient(main.app) as client:
        document = client.get("/openapi.json").json()
        response = document["paths"]["/equity/exact"]["post"]["responses"]["500"]
        assert response["content"]["application/json"]["schema"] == {
            "$ref": "#/components/schemas/ErrorResponse"
        }
