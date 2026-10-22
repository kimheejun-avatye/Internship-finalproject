"""회의마다 사용자별 메모를 하나로 제한한다.

Revision ID: 0008
Revises: 0007
"""

from alembic import op


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.create_unique_constraint(
        "uq_memo_reservation_user",
        "memo",
        ["reservation_id", "user_id"],
    )


def downgrade():
    op.drop_constraint("uq_memo_reservation_user", "memo", type_="unique")
