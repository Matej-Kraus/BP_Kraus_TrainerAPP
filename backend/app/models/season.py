from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Season(Base):
    __tablename__ = "seasons"
    __table_args__ = (
        UniqueConstraint("club_id", "name", name="uq_seasons_club_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    club_id: Mapped[int] = mapped_column(Integer, ForeignKey("clubs.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)  # např. "2025/2026"
