"""예약별 인증 시도와 원자적 사용 기록.

Revision ID: 0008
Revises: 0007
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "captcha_intents",
        sa.Column("intent_id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("challenge_id", sa.Text(), nullable=False, unique=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completion_id", sa.Text()),
        sa.Column("reservation_id", sa.Uuid(), sa.ForeignKey("reservations.reservation_id"), unique=True),
        sa.UniqueConstraint("completion_id", name="uq_captcha_intents_completion"),
        sa.CheckConstraint("(completion_id IS NULL) = (reservation_id IS NULL)",
                           name="ck_captcha_intents_consumed_pair"),
    )
    op.create_index("ix_captcha_intents_user_id", "captcha_intents", ["user_id"])


def downgrade():
    op.drop_table("captcha_intents")
