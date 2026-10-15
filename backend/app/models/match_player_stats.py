from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class MatchPlayerStats(Base):
    __tablename__ = "match_player_stats"
    __table_args__ = (
        UniqueConstraint("match_id", "player_id", name="uq_match_player_stats_match_player"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    match_id: Mapped[int] = mapped_column(Integer, ForeignKey("matches.id"), nullable=False, index=True)
    player_id: Mapped[int] = mapped_column(Integer, ForeignKey("players.id"), nullable=False, index=True)

    goals: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    assists: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    errors: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    won_balls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lost_balls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fouls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    passes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # successful
    passes_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    won_duels: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lost_duels: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    shots_on_goal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    shots_off_goal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    yellow_cards: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    red_cards: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    penalties: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
