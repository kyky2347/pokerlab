"""Initial experiment, trainer, and solver tables."""

import sqlalchemy as sa

from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "experiments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("experiment_type", sa.String(64), nullable=False),
        sa.Column("parameters", sa.JSON(), nullable=False),
        sa.Column("results", sa.JSON(), nullable=False),
        sa.Column("seed", sa.Integer(), nullable=True),
        sa.Column("engine", sa.String(64), nullable=False),
        sa.Column("runtime_ms", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_experiments_experiment_type", "experiments", ["experiment_type"])
    op.create_table(
        "trainer_answers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("difficulty", sa.String(32), nullable=False),
        sa.Column("answer", sa.Float(), nullable=False),
        sa.Column("true_equity", sa.Float(), nullable=False),
        sa.Column("absolute_error", sa.Float(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_trainer_answers_category", "trainer_answers", ["category"])
    op.create_table(
        "solver_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("parameters", sa.JSON(), nullable=False),
        sa.Column("results", sa.JSON(), nullable=True),
        sa.Column("runtime_ms", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("solver_jobs")
    op.drop_index("ix_trainer_answers_category", table_name="trainer_answers")
    op.drop_table("trainer_answers")
    op.drop_index("ix_experiments_experiment_type", table_name="experiments")
    op.drop_table("experiments")
