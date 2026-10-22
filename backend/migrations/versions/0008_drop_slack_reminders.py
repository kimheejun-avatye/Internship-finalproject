"""Drop slack_reminders (feature removed).

Revision ID: 0008
Revises: 0007
"""

from alembic import op


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table("slack_reminders")
    op.execute("DROP TYPE IF EXISTS reminder_status")


def downgrade():
    raise NotImplementedError("0003 의 slack_reminders 정의를 참고해 직접 복원한다")
