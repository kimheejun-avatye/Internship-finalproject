"""Chat messages: kind (TEXT/RESERVATION) and payload for reservation cards.

Revision ID: 0010
Revises: 0009
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    # 기존 메시지는 모두 일반 텍스트다. 예약 카드는 서버만 만들 수 있다
    op.add_column("messages", sa.Column("kind", sa.Text(), nullable=False, server_default="TEXT"))
    op.add_column("messages", sa.Column("payload", postgresql.JSONB(), nullable=True))
    op.create_check_constraint("ck_messages_kind", "messages", "kind IN ('TEXT', 'RESERVATION')")
    # 예약 카드에는 데이터가 있고, 일반 텍스트에는 없다
    op.create_check_constraint("ck_messages_payload", "messages", "(kind = 'RESERVATION') = (payload IS NOT NULL)")


def downgrade():
    op.drop_constraint("ck_messages_payload", "messages", type_="check")
    op.drop_constraint("ck_messages_kind", "messages", type_="check")
    op.drop_column("messages", "payload")
    op.drop_column("messages", "kind")
