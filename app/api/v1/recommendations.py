"""
API v1 router for AI Recommendations.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.recommendation import get_all_recommendations

router = APIRouter(prefix="/recommendations", tags=["Recommendations"])


@router.get("/")
def read_recommendations(db: Session = Depends(get_db)):
    """
    Fetch personalized trading recommendations for all households based on
    current market price, AI forecast, and battery levels.
    """
    return get_all_recommendations(db)
