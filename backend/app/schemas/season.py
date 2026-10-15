from pydantic import BaseModel


class SeasonCreate(BaseModel):
    name: str

class SeasonOut(SeasonCreate):
    id: int
    class Config:
        from_attributes = True
