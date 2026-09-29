"""History paging and lossless exports on both supported database engines."""

import base64
import json
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, event, select

from pokerlab_api import database
from pokerlab_api.database import Experiment
from pokerlab_api.history import HistoryCursor
from pokerlab_api.main import app


@pytest.fixture
def ledger(storage_db):
    database.initialize_database()
    with TestClient(app) as client:
        yield client, storage_db


def add_records(count=7, *, large=False):
    timestamp = datetime(2026, 1, 2, 3, 4, 5, 123456, tzinfo=UTC)
    with database.SessionLocal() as session:
        for index in range(count):
            session.add(
                Experiment(
                    id=f"record-{index:03d}",
                    experiment_type="exact_equity",
                    parameters={"note": "复现"},
                    results={"payload": "x" * 100_000 if large else "small", "seed": 2**63 - 1},
                    seed=2**63 - 1 if index % 2 else None,
                    engine="Python reference",
                    runtime_ms=1.25,
                    created_at=timestamp - timedelta(seconds=index // 3),
                )
            )
        session.commit()
    return timestamp


def test_empty_page_reports_the_real_database(ledger):
    client, engine = ledger
    response = client.get("/experiments/page")
    assert response.status_code == 200
    assert response.json() == {
        "experiments": [],
        "next_cursor": None,
        "database": engine.dialect.name,
    }


def test_paging_visits_every_record_once_with_timestamp_ties(ledger):
    client, _ = ledger
    add_records(23)
    with database.SessionLocal() as session:
        expected = list(
            session.scalars(
                select(Experiment.id).order_by(Experiment.created_at.desc(), Experiment.id.desc())
            )
        )
    ids = []
    cursor = None
    while True:
        params = {"limit": 4}
        if cursor:
            params["cursor"] = cursor
        response = client.get("/experiments/page", params=params)
        assert response.status_code == 200
        page = response.json()
        assert len(page["experiments"]) <= 4
        ids.extend(item["id"] for item in page["experiments"])
        cursor = page["next_cursor"]
        if cursor is None:
            break
        assert len(ids) < 30, "Pagination must terminate"
    assert ids == expected


def test_cursor_survives_newer_inserts_and_boundary_deletion(ledger):
    client, _ = ledger
    timestamp = add_records()
    first = client.get("/experiments/page?limit=2").json()
    boundary_id = first["experiments"][-1]["id"]
    with database.SessionLocal() as session:
        session.execute(delete(Experiment).where(Experiment.id == boundary_id))
        session.add(
            Experiment(
                id="newer",
                experiment_type="exact_equity",
                parameters={},
                results={},
                seed=0,
                engine="Python reference",
                runtime_ms=0,
                created_at=timestamp + timedelta(days=1),
            )
        )
        session.commit()
    second = client.get("/experiments/page", params={"limit": 100, "cursor": first["next_cursor"]})
    assert second.status_code == 200
    assert [row["id"] for row in second.json()["experiments"]] == [
        "record-000",
        "record-005",
        "record-004",
        "record-003",
        "record-006",
    ]
    assert client.get("/experiments/page").json()["experiments"][0]["id"] == "newer"


def test_summary_does_not_select_large_json_columns_and_preserves_seeds(ledger):
    client, engine = ledger
    add_records(20, large=True)
    statements = []

    def observe(_connection, _cursor, statement, _parameters, _context, _executemany):
        statements.append(statement.lower())

    event.listen(engine, "before_cursor_execute", observe)
    try:
        response = client.get("/experiments/page")
    finally:
        event.remove(engine, "before_cursor_execute", observe)
    assert response.status_code == 200
    assert len(response.content) < 10_000  # Versus 2 MB of stored result payloads.
    selects = [sql for sql in statements if "from experiments" in sql]
    assert len(selects) == 1
    assert "experiments.results" not in selects[0]
    assert "experiments.parameters" not in selects[0]
    assert "limit" in selects[0] and "offset" not in selects[0].split("limit")[0]
    summaries = response.json()["experiments"]
    assert any(row["seed"] == str(2**63 - 1) for row in summaries)
    assert any(row["seed"] is None for row in summaries)
    assert all(row["timestamp"].endswith("+00:00") for row in summaries)
    assert all("parameters" not in row and "results" not in row for row in summaries)


@pytest.mark.parametrize("limit", ["0", "-1", "101", "1.5", "bad"])
def test_page_limit_is_bounded(ledger, limit):
    client, _ = ledger
    assert client.get("/experiments/page", params={"limit": limit}).status_code == 422


@pytest.mark.parametrize(
    "token",
    [
        "",
        "???",
        "x" * 513,
        "你好",
        "e30",  # Empty JSON is missing a boundary.
        base64.urlsafe_b64encode(
            b'{"version":2,"timestamp":"2026-01-01T00:00:00Z","id":"x"}'
        ).decode(),
        base64.urlsafe_b64encode(b'{"timestamp":"2026-01-01T00:00:00","id":"x"}').decode(),
        base64.urlsafe_b64encode(b'{"timestamp":"invalid","id":"x"}').decode(),
        base64.urlsafe_b64encode(b'{"timestamp":"0001-01-01T00:00:00+14:00","id":"x"}').decode(),
        base64.urlsafe_b64encode(b'{"timestamp":"9999-12-31T23:59:59-14:00","id":"x"}').decode(),
        base64.urlsafe_b64encode(b'{"timestamp":"2026-01-01T00:00:00Z","id":"\\u0000"}').decode(),
        base64.urlsafe_b64encode(b'{"timestamp":"2026-01-01T00:00:00Z","id":"\\ud800"}').decode(),
    ],
)
def test_malformed_cursors_fail_cleanly(ledger, token):
    client, _ = ledger
    response = client.get("/experiments/page", params={"cursor": token})
    assert response.status_code == 422


def test_cursor_timezone_is_normalized_before_seeking(ledger):
    client, _ = ledger
    add_records()
    cursor = HistoryCursor(timestamp="2026-01-02T05:04:05.123456+02:00", id="record-001")
    response = client.get("/experiments/page", params={"cursor": cursor.encode()})
    assert response.status_code == 200
    assert response.json()["experiments"][0]["id"] == "record-000"


def test_export_is_lossless_and_legacy_endpoints_remain_compatible(ledger):
    client, _ = ledger
    add_records(2)
    legacy = client.get("/experiments/record-001")
    export = client.get("/experiments/record-001/export")
    assert export.status_code == 200
    assert export.json() == legacy.json()
    assert export.headers["content-type"] == "application/json"
    assert export.headers["cache-control"] == "no-store"
    assert 'filename="pokerlab-record-001.json"' in export.headers["content-disposition"]
    assert '"seed": 9223372036854775807' in export.text
    assert '"note": "复现"' in export.text
    assert json.loads(export.text)["results"]["seed"] == 2**63 - 1
    assert "results" in client.get("/experiments").json()["experiments"][0]
    assert client.get("/experiments/missing/export").status_code == 404
