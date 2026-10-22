"""Chat: 1:1 room key, room ordering, membership times, message limits.

Revision ID: 0007
Revises: 0006
"""

from alembic import op
import sqlalchemy as sa


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    # 채팅방: 1:1방 중복 방지 키, 만든 사람, 목록 정렬용 마지막 메시지 시각
    op.add_column("chat_room", sa.Column("direct_key", sa.Text(), nullable=True))
    op.add_column("chat_room", sa.Column("created_by", sa.Uuid(), nullable=True))
    op.add_column("chat_room", sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key("chat_room_created_by_fkey", "chat_room", "users", ["created_by"], ["user_id"])
    op.create_check_constraint("ck_chat_room_direct_key", "chat_room", "(type = 'DIRECT') = (direct_key IS NOT NULL)")
    op.create_index(
        "chat_room_direct_key_uniq",
        "chat_room",
        ["direct_key"],
        unique=True,
        postgresql_where=sa.text("type = 'DIRECT' AND deleted_at IS NULL"),
    )
    op.create_index("ix_chat_room_last_message_at", "chat_room", [sa.text("last_message_at DESC")])

    # 참여자: 들어온·나간 시각
    op.add_column(
        "chat_room_member",
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.add_column("chat_room_member", sa.Column("left_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_chat_room_member_user_id", "chat_room_member", ["user_id"])

    # 메시지: 길이 제한, 방별 최신순 조회
    op.create_check_constraint("ck_messages_length", "messages", "char_length(message) BETWEEN 1 AND 2000")
    # 0006 의 (chat_room_id, created_at) 인덱스를 커서 조회용으로 바꾼다. 같은 시각 메시지는 message_id 로 정렬
    op.drop_index("ix_messages_room_created", table_name="messages")
    op.create_index(
        "ix_messages_room_created",
        "messages",
        ["chat_room_id", sa.text("created_at DESC"), sa.text("message_id DESC")],
    )


def downgrade():
    op.drop_index("ix_messages_room_created", table_name="messages")
    op.create_index("ix_messages_room_created", "messages", ["chat_room_id", "created_at"])
    op.drop_constraint("ck_messages_length", "messages", type_="check")

    op.drop_index("ix_chat_room_member_user_id", table_name="chat_room_member")
    op.drop_column("chat_room_member", "left_at")
    op.drop_column("chat_room_member", "joined_at")

    op.drop_index("ix_chat_room_last_message_at", table_name="chat_room")
    op.drop_index("chat_room_direct_key_uniq", table_name="chat_room")
    op.drop_constraint("ck_chat_room_direct_key", "chat_room", type_="check")
    op.drop_constraint("chat_room_created_by_fkey", "chat_room", type_="foreignkey")
    op.drop_column("chat_room", "last_message_at")
    op.drop_column("chat_room", "created_by")
    op.drop_column("chat_room", "direct_key")
