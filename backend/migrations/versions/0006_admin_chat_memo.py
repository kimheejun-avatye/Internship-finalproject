"""Admin, chat and memo tables; users.position.

Revision ID: 0006
Revises: 0005
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

UUID_PK = dict(server_default=sa.text("gen_random_uuid()"))
NOW = dict(server_default=sa.func.now())


def upgrade():
    # 기존 행은 빈 문자열로 채운다
    op.add_column("users", sa.Column("position", sa.Text(), nullable=False, server_default=""))

    op.create_table(
        "admin",
        sa.Column("admin_id", sa.Uuid(), nullable=False, **UUID_PK),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, **NOW),
        sa.PrimaryKeyConstraint("admin_id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"]),
        sa.UniqueConstraint("user_id", name="uq_admin_user_id"),
    )

    chat_room_type = postgresql.ENUM("DIRECT", "GROUP", name="chat_room_type", create_type=False)
    chat_room_type.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "chat_room",
        sa.Column("chat_room_id", sa.Uuid(), nullable=False, **UUID_PK),
        sa.Column("title", sa.Text()),
        sa.Column("type", chat_room_type, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, **NOW),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("chat_room_id"),
    )

    op.create_table(
        "chat_room_member",
        sa.Column("chat_room_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("chat_room_id", "user_id"),
        sa.ForeignKeyConstraint(["chat_room_id"], ["chat_room.chat_room_id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"]),
    )

    op.create_table(
        "messages",
        sa.Column("message_id", sa.Uuid(), nullable=False, **UUID_PK),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("chat_room_id", sa.Uuid(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, **NOW),
        sa.PrimaryKeyConstraint("message_id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"]),
        sa.ForeignKeyConstraint(["chat_room_id"], ["chat_room.chat_room_id"]),
    )
    op.create_index("ix_messages_room_created", "messages", ["chat_room_id", "created_at"])

    op.create_table(
        "memo",
        sa.Column("memo_id", sa.Uuid(), nullable=False, **UUID_PK),
        sa.Column("reservation_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("memo", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, **NOW),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("memo_id"),
        sa.ForeignKeyConstraint(["reservation_id"], ["reservations.reservation_id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"]),
    )


def downgrade():
    op.drop_table("memo")
    op.drop_index("ix_messages_room_created", table_name="messages")
    op.drop_table("messages")
    op.drop_table("chat_room_member")
    op.drop_table("chat_room")
    op.execute("DROP TYPE IF EXISTS chat_room_type")
    op.drop_table("admin")
    op.drop_column("users", "position")
