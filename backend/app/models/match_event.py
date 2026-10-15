from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base
from app.util.time import utcnow


class MatchEvent(Base):
    __tablename__ = "match_events"
    __table_args__ = (
        UniqueConstraint("match_id", "client_event_id", name="uq_match_events_match_client"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    match_id: Mapped[int] = mapped_column(Integer, ForeignKey("matches.id"), nullable=False, index=True)
    player_id: Mapped[int] = mapped_column(Integer, ForeignKey("players.id"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String, nullable=False, index=True)
    # Always +1 since events v2 (legacy column). Undo = soft delete via deleted_at.
    delta: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    half: Mapped[int] = mapped_column(Integer, nullable=False)  # 1/2
    second_in_match: Mapped[int] = mapped_column(Integer, nullable=False)  # 0..(90*60+)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    # Soft delete: removed events are kept for audit but ignored in stats and lists.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True, index=True
    )
    # Client-generated id that makes retries (offline queue) idempotent.
    client_event_id: Mapped[str | None] = mapped_column(String, nullable=True)
