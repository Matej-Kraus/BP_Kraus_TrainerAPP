from typing import Literal

from pydantic import BaseModel, Field

from app.common.enums import EventType

# Re-export for backward compatibility
ALLOWED_EVENT_TYPES = {e.value for e in EventType}


class MatchEventCreate(BaseModel):
    """Event recorded during a live match. second_in_match = total seconds into the match (0 = kick-off 1st half)."""

    player_id: int
    event_type: EventType
    delta: Literal[1] | None = Field(
        default=None,
        description="Deprecated: events are always +1. Undo an event with DELETE instead.",
    )
    half: int = Field(..., ge=1, le=2, description="1 = first half, 2 = second half")
    second_in_match: int = Field(
        ...,
        ge=0,
        description="Exact match time in seconds (0 = kick-off; 2700 = 45:00). Used for analytics.",
    )
    client_event_id: str | None = Field(
        default=None,
        min_length=1,
        max_length=64,
        description="Client-generated id; sending the same id again returns the existing event.",
    )


class MatchEventOut(BaseModel):
    """Event with exact match timestamp (half + second_in_match) for analytics."""

    id: int
    match_id: int
    player_id: int
    event_type: str
    delta: int
    half: int
    second_in_match: int
    client_event_id: str | None = None
    created_by_email: str | None = None

    class Config:
        from_attributes = True
