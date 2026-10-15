from datetime import datetime

from pydantic import BaseModel


class PlayerCreate(BaseModel):
    first_name: str
    last_name: str
    jersey_number: int
    position: str | None = None
    season_id: int | None = None

class PlayerOut(PlayerCreate):
    id: int
    archived_at: datetime | None = None

    class Config:
        from_attributes = True
