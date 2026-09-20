"""Transactional, versioned upgrades, including pre-Alembic PokerLab databases."""

from pathlib import Path
from threading import Lock

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

# Freeze the legacy layout rather than deriving it from evolving ORM models.
LEGACY_COLUMNS = {
    "experiments": set(
        "id experiment_type parameters results seed engine runtime_ms created_at".split()
    ),
    "trainer_answers": set(
        "id category difficulty answer true_equity absolute_error score created_at".split()
    ),
    "solver_jobs": set("id status parameters results runtime_ms created_at".split()),
}
_migration_lock = Lock()  # Alembic's environment context is process-global.


def migration_config() -> Config:
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parent).replace("%", "%%"))
    return config


def upgrade_database(engine: Engine) -> None:
    """Apply upgrades atomically; serialize startup across threads and workers."""
    with _migration_lock, engine.begin() as connection:
        if connection.dialect.name == "postgresql":
            connection.execute(text("SELECT pg_advisory_xact_lock(7060752401)"))
        elif connection.dialect.name == "sqlite":
            # SQLite's legacy driver mode otherwise autocommits DDL statements.
            connection.exec_driver_sql("BEGIN IMMEDIATE")
        else:
            raise RuntimeError(
                "PokerLab supports SQLite and PostgreSQL only / 仅支持 SQLite 与 PostgreSQL"
            )

        config = migration_config()
        config.attributes["connection"] = connection
        inspector = inspect(connection)
        tables = set(inspector.get_table_names())
        version = MigrationContext.configure(connection).get_current_heads()
        legacy_tables = tables.intersection(LEGACY_COLUMNS)
        if not version and legacy_tables:
            if legacy_tables != set(LEGACY_COLUMNS):
                raise RuntimeError(
                    "Incomplete legacy database; restore a complete backup before upgrading / "
                    "旧数据库结构不完整，请先恢复完整备份再升级"
                )
            for table, expected in LEGACY_COLUMNS.items():
                actual = {column["name"] for column in inspector.get_columns(table)}
                primary_key = inspector.get_pk_constraint(table)["constrained_columns"]
                if actual != expected or primary_key != ["id"]:
                    raise RuntimeError(
                        "Unrecognized legacy database schema; automatic migration stopped / "
                        "旧数据库结构无法识别，已停止自动迁移"
                    )
            command.stamp(config, "0001_initial")
        command.upgrade(config, "head")
