"""events v2: soft delete, idempotency key, author, failed passes

Revision ID: f1b2c3d4e5f6
Revises: f1a1c2d3e4f5
Create Date: 2026-10-15 11:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.scripts.event_migration_v2 import convert_events_from_v2, convert_events_to_v2

# revision identifiers, used by Alembic.
revision: str = "f1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "f1a1c2d3e4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("match_events") as batch_op:
        batch_op.add_column(sa.Column("deleted_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("created_by_user_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("client_event_id", sa.String(), nullable=True))
        batch_op.create_foreign_key(
            "fk_match_events_created_by_user_id", "users", ["created_by_user_id"], ["id"]
        )
        batch_op.create_index(
            op.f("ix_match_events_created_by_user_id"), ["created_by_user_id"], unique=False
        )
        batch_op.create_unique_constraint(
            "uq_match_events_match_client", ["match_id", "client_event_id"]
        )
    with op.batch_alter_table("match_player_stats") as batch_op:
        batch_op.add_column(
            sa.Column("passes_failed", sa.Integer(), nullable=False, server_default="0")
        )

    convert_events_to_v2(op.get_bind())


def downgrade() -> None:
    convert_events_from_v2(op.get_bind())

    with op.batch_alter_table("match_player_stats") as batch_op:
        batch_op.drop_column("passes_failed")
    with op.batch_alter_table("match_events") as batch_op:
        batch_op.drop_constraint("uq_match_events_match_client", type_="unique")
        batch_op.drop_index(op.f("ix_match_events_created_by_user_id"))
        batch_op.drop_constraint("fk_match_events_created_by_user_id", type_="foreignkey")
        batch_op.drop_column("client_event_id")
        batch_op.drop_column("created_by_user_id")
        batch_op.drop_column("deleted_at")
