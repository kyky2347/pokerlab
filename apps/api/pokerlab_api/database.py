from __future__ import annotations

from collections.abc import Generator
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import JSON, BigInteger, DateTime, Float, Index, Integer, String, create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from .config import get_settings
from .migrations import upgrade_database

SEED_TYPE = BigInteger().with_variant(Integer, "sqlite")


class Base(DeclarativeBase):
    pass


class Experiment(Base):
    __tablename__ = "experiments"
    __table_args__ = (Index("ix_experiments_timeline", "created_at", "id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    experiment_type: Mapped[str] = mapped_column(String(64), index=True)
    parameters: Mapped[dict] = mapped_column(JSON)
    results: Mapped[dict] = mapped_column(JSON)
    seed: Mapped[int | None] = mapped_column(SEED_TYPE, nullable=True)
    engine: Mapped[str] = mapped_column(String(64))
    runtime_ms: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class TrainerAnswer(Base):
    __tablename__ = "trainer_answers"
    __table_args__ = (Index("uq_trainer_answers_question_id", "question_id", unique=True),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    question_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    category: Mapped[str] = mapped_column(String(64), index=True)
    difficulty: Mapped[str] = mapped_column(String(32))
    answer: Mapped[float] = mapped_column(Float)
    true_equity: Mapped[float] = mapped_column(Float)
    absolute_error: Mapped[float] = mapped_column(Float)
    score: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class TrainerQuestion(Base):
    __tablename__ = "trainer_questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    category: Mapped[str] = mapped_column(String(64))
    difficulty: Mapped[str] = mapped_column(String(32))
    hero: Mapped[list] = mapped_column(JSON)
    villain: Mapped[list] = mapped_column(JSON)
    board: Mapped[list] = mapped_column(JSON)
    seed: Mapped[int] = mapped_column(SEED_TYPE)
    engine: Mapped[str] = mapped_column(String(64))
    adaptive_weight: Mapped[float] = mapped_column(Float)
    true_equity: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SolverJob(Base):
    __tablename__ = "solver_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    status: Mapped[str] = mapped_column(String(24), default="running")
    parameters: Mapped[dict] = mapped_column(JSON)
    results: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    runtime_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
active_database = "sqlite" if settings.database_url.startswith("sqlite") else "postgresql"


def initialize_database() -> None:
    try:
        upgrade_database(engine)
    except SQLAlchemyError:
        raise RuntimeError(
            "Cannot initialize the configured database. Check connectivity, credentials, "
            "and migration permissions; no fallback database was created. / "
            "无法初始化指定数据库，请检查连接、凭据和迁移权限；未创建替代数据库。"
        ) from None


def active_database_name() -> str:
    return active_database


def get_db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
