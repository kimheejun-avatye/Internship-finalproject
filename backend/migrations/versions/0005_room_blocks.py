"""Admin: temporary room blocks.

Revision ID: 0005
Revises: merge_0004
"""

from alembic import op
import sqlalchemy as sa


revision = "0005"
down_revision = "merge_0004"
branch_labels = None
depends_on = None


def upgrade():
    # 관리자의 회의실 일시 차단 이력
    op.create_table(
        "room_blocks",
        sa.Column("block_id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("blocked_by", sa.Uuid(), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("block_id"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.room_id"]),
        sa.ForeignKeyConstraint(["blocked_by"], ["users.user_id"]),
        sa.CheckConstraint("end_at > start_at", name="ck_room_blocks_time_order"),
    )
    op.create_index("ix_room_blocks_room_end", "room_blocks", ["room_id", "end_at"])


def downgrade():
    op.drop_index("ix_room_blocks_room_end", table_name="room_blocks")
    op.drop_table("room_blocks")
