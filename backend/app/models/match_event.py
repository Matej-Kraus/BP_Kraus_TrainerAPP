from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base
from app.util.time import utcnow


class MatchEvent(Base):
    __tablename__ = "match_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    match_id: Mapped[int] = mapped_column(Integer, ForeignKey("matches.id"), nullable=False, index=True)
    player_id: Mapped[int] = mapped_column(Integer, ForeignKey("players.id"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String, nullable=False, index=True)
    delta: Mapped[int] = mapped_column(Integer, nullable=False)  # +1 / -1
    half: Mapped[int] = mapped_column(Integer, nullable=False)  # 1/2
    second_in_match: Mapped[int] = mapped_column(Integer, nullable=False)  # 0..(90*60+)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
