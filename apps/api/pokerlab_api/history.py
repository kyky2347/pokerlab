"""Bounded, payload-free history pages over the existing timeline index."""

from __future__ import annotations

import base64
from datetime import UTC, datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from sqlalchemy import select, tuple_
from sqlalchemy.orm import Session, load_only

from .database import Experiment


def utc_timestamp(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class HistoryCursor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    timestamp: AwareDatetime
    id: str = Field(min_length=1, max_length=36)

    def encode(self) -> str:
        return base64.urlsafe_b64encode(self.model_dump_json().encode()).decode().rstrip("=")

    @classmethod
    def decode(cls, token: str) -> HistoryCursor:
        try:
            payload = base64.b64decode(
                token + "=" * (-len(token) % 4), altchars=b"-_", validate=True
            )
            cursor = cls.model_validate_json(payload)
            # Reject timezone overflow and text unsupported by PostgreSQL at
            # the request boundary, before either database executes a query.
            cursor.timestamp = utc_timestamp(cursor.timestamp)
            if "\x00" in cursor.id:
                raise ValueError("Cursor IDs cannot contain NUL bytes")
            return cursor
        except (ValueError, OverflowError):
            raise ValueError("Invalid history cursor. / 实验历史游标无效。") from None


def experiment_page(db: Session, limit: int, cursor: HistoryCursor | None) -> dict:
    query = select(Experiment).options(
        load_only(
            Experiment.id,
            Experiment.experiment_type,
            Experiment.seed,
            Experiment.engine,
            Experiment.runtime_ms,
            Experiment.created_at,
            raiseload=True,
        )
    )
    if cursor is not None:
        # Row-value comparison uses the (created_at, id) index on both supported
        # databases. Newer inserts cannot shift an already-issued boundary.
        query = query.where(
            tuple_(Experiment.created_at, Experiment.id)
            < tuple_(utc_timestamp(cursor.timestamp), cursor.id)
        )
    records = db.scalars(
        query.order_by(Experiment.created_at.desc(), Experiment.id.desc()).limit(limit + 1)
    ).all()
    visible = records[:limit]
    next_cursor = None
    if len(records) > limit:
        last = visible[-1]
        next_cursor = HistoryCursor(timestamp=utc_timestamp(last.created_at), id=last.id).encode()
    return {
        "experiments": [
            {
                "id": record.id,
                "experiment_type": record.experiment_type,
                # Browser numbers cannot represent every signed 64-bit seed.
                "seed": str(record.seed) if record.seed is not None else None,
                "engine": record.engine,
                "runtime_ms": record.runtime_ms,
                "timestamp": utc_timestamp(record.created_at).isoformat(),
            }
            for record in visible
        ],
        "next_cursor": next_cursor,
        "database": db.get_bind().dialect.name,
    }
