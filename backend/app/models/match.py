from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    club_id: Mapped[int] = mapped_column(Integer, ForeignKey("clubs.id"), nullable=False, index=True)
    season_id: Mapped[int] = mapped_column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    opponent: Mapped[str] = mapped_column(String, nullable=False)
    competition: Mapped[str | None] = mapped_column(String, nullable=True)

    match_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    # planned -> live_half_1 -> half_time -> live_half_2 -> finished
    status: Mapped[str] = mapped_column(String, nullable=False, default="planned")

    # Accumulated seconds when not currently running (e.g. at half-time or finished).
    seconds_before_live: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # When status is live_* this stores the UTC start time of current live segment.
    live_started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
