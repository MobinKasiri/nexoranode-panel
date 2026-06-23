"""admin permissions and ban fields

Revision ID: 0002
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("admin_users", sa.Column("permissions", sa.JSON(), nullable=True))
    op.add_column(
        "admin_users",
        sa.Column("role_preset", sa.String(30), nullable=False, server_default="custom"),
    )
    op.add_column("admin_users", sa.Column("banned_at", sa.DateTime(), nullable=True))
    op.add_column("admin_users", sa.Column("banned_by_id", sa.Integer(), nullable=True))
    op.create_index(
        "ix_audit_logs_admin_id_created_at",
        "audit_logs",
        ["admin_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_audit_logs_admin_id_created_at", table_name="audit_logs")
    op.drop_column("admin_users", "banned_by_id")
    op.drop_column("admin_users", "banned_at")
    op.drop_column("admin_users", "role_preset")
    op.drop_column("admin_users", "permissions")
