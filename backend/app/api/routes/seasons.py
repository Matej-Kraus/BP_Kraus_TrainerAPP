from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_role
from app.models.season import Season
from app.models.user import User
from app.schemas.season import SeasonCreate, SeasonOut

router = APIRouter(prefix="/seasons", tags=["seasons"])

@router.post("", response_model=SeasonOut)
def create_season(
    payload: SeasonCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("coach")),
):
    existing = (
        db.query(Season)
        .filter(Season.club_id == current_user.club_id, Season.name == payload.name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Season already exists")
    s = Season(club_id=current_user.club_id, name=payload.name)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s

@router.get("", response_model=list[SeasonOut])
def list_seasons(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(Season)
        .filter(Season.club_id == current_user.club_id)
        .order_by(Season.id.desc())
        .all()
    )
