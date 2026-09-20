"""Persist training questions, widen seeds, and index the experiment timeline."""

import sqlalchemy as sa

from alembic import op

revision = "0002_durable_training"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite INTEGER already stores signed 64-bit values. Avoid rebuilding it.
    if op.get_bind().dialect.name == "postgresql":
        op.alter_column("experiments", "seed", existing_type=sa.Integer(), type_=sa.BigInteger())
    op.create_index("ix_experiments_timeline", "experiments", ["created_at", "id"])
    op.create_table(
        "trainer_questions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("difficulty", sa.String(32), nullable=False),
        sa.Column("hero", sa.JSON(), nullable=False),
        sa.Column("villain", sa.JSON(), nullable=False),
        sa.Column("board", sa.JSON(), nullable=False),
        sa.Column("seed", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("engine", sa.String(64), nullable=False),
        sa.Column("adaptive_weight", sa.Float(), nullable=False),
        sa.Column("true_equity", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("trainer_answers", sa.Column("question_id", sa.String(36), nullable=True))
    op.create_index(
        "uq_trainer_answers_question_id", "trainer_answers", ["question_id"], unique=True
    )


def downgrade() -> None:
    raise RuntimeError(
        "This migration is forward-only to preserve questions and 64-bit seeds. "
        "Restore a verified pre-upgrade backup to roll back. / "
        "为保护题目与 64 位种子，本次迁移仅支持升级；回滚请恢复已验证的升级前备份。"
    )
