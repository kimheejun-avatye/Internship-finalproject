"""Chat: rooms, members, messages.

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

room_type = postgresql.ENUM("DIRECT", "GROUP", name="chat_room_type", create_type=False)


def upgrade():
    room_type.create(op.get_bind(), checkfirst=False)

    # 채팅방. 1:1방은 direct_key 로 중복 생성을 막는다
    op.create_table(
        "chat_rooms",
        sa.Column(
            "chat_room_id",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("type", room_type, nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("direct_key", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("chat_room_id"),
        sa.ForeignKeyConstraint(["created_by"], ["users.user_id"]),
        sa.CheckConstraint(
            "(type = 'DIRECT') = (direct_key IS NOT NULL)",
            name="ck_chat_rooms_direct_key",
        ),
    )
    op.create_index(
        "chat_rooms_direct_key_uniq",
        "chat_rooms",
        ["direct_key"],
        unique=True,
        postgresql_where=sa.text("type = 'DIRECT' AND deleted_at IS NULL"),
    )
    op.create_index(
        "ix_chat_rooms_last_message_at",
        "chat_rooms",
        [sa.text("last_message_at DESC")],
    )

    # 채팅방 참여자. left_at 이 NULL 이면 참여 중
    op.create_table(
        "chat_room_members",
        sa.Column("chat_room_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("chat_room_id", "user_id"),
        sa.ForeignKeyConstraint(
            ["chat_room_id"], ["chat_rooms.chat_room_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"]),
    )
    op.create_index(
        "ix_chat_room_members_user_id", "chat_room_members", ["user_id"]
    )

    # 채팅 메시지
    op.create_table(
        "chat_messages",
        sa.Column(
            "message_id",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("chat_room_id", sa.Uuid(), nullable=False),
        sa.Column("sender_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("message_id"),
        sa.ForeignKeyConstraint(
            ["chat_room_id"], ["chat_rooms.chat_room_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["sender_id"], ["users.user_id"]),
        sa.CheckConstraint(
            "char_length(content) BETWEEN 1 AND 2000",
            name="ck_chat_messages_content_length",
        ),
    )
    op.create_index(
        "ix_chat_messages_room_created",
        "chat_messages",
        ["chat_room_id", sa.text("created_at DESC"), sa.text("message_id DESC")],
    )


def downgrade():
    op.drop_index("ix_chat_messages_room_created", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_index("ix_chat_room_members_user_id", table_name="chat_room_members")
    op.drop_table("chat_room_members")
    op.drop_index("ix_chat_rooms_last_message_at", table_name="chat_rooms")
    op.drop_index("chat_rooms_direct_key_uniq", table_name="chat_rooms")
    op.drop_table("chat_rooms")
    room_type.drop(op.get_bind(), checkfirst=False)
