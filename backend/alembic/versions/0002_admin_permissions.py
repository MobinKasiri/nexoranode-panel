"""admin permissions and ban fields

Revision ID: 0002
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def _indexes(table: str) -> set[str]:
    return {idx["name"] for idx in inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    cols = _columns("admin_users")
    if "permissions" not in cols:
        op.add_column("admin_users", sa.Column("permissions", sa.JSON(), nullable=True))
    if "role_preset" not in cols:
        op.add_column(
            "admin_users",
            sa.Column("role_preset", sa.String(30), nullable=False, server_default="custom"),
        )
    if "banned_at" not in cols:
        op.add_column("admin_users", sa.Column("banned_at", sa.DateTime(), nullable=True))
    if "banned_by_id" not in cols:
        op.add_column("admin_users", sa.Column("banned_by_id", sa.Integer(), nullable=True))

    if "ix_audit_logs_admin_id_created_at" not in _indexes("audit_logs"):
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
