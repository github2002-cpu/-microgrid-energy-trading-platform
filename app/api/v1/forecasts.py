"""
API v1 router for AI/Analytics forecasting endpoints.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.forecast import predict_next_price, predict_demand_trend

router = APIRouter(prefix="/forecast", tags=["Forecast"])


@router.get("/")
def get_market_forecast(horizon: int = 6, db: Session = Depends(get_db)):
    """
    Get the next-hour clearing price prediction and short-term 
    demand trend based on historical simulation data.
    """
    if horizon <= 0 or horizon > 48:
        return {"error": "Horizon must be between 1 and 48 hours"}

    price_pred = predict_next_price(db, window_hours=3)
    demand_trend = predict_demand_trend(db, horizon_hours=horizon)
    
    return {
        "next_hour_price_prediction": price_pred,
        "demand_trend": demand_trend
    }
