"""
Simple forecasting service for the microgrid.
Provides lightweight predictions without heavy ML frameworks.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.market_state import MarketState
from app.models.energy_log import EnergyLog


def predict_next_price(db: Session, window_hours: int = 3) -> float:
    """
    Predict next hour's clearing price using a Simple Moving Average (SMA).
    
    We average the last N ticks (default 3) to smooth out noise while 
    still reacting to immediate trends.
    """
    states = db.query(MarketState).order_by(MarketState.timestamp.desc()).limit(window_hours).all()
    if not states:
        return 0.1200  # Fallback to BASE_PRICE
    
    avg_price = sum(s.current_price_per_kwh for s in states) / len(states)
    return round(avg_price, 4)


def predict_demand_trend(db: Session, horizon_hours: int = 6) -> list[dict]:
    """
    Predict aggregate demand for the next few hours.
    
    Uses a naive persistence model combining seasonal lag and recent memory:
    - If data exists from exactly 24 hours ago (same time of day), use it.
    - Otherwise, fallback to the most recent known demand.
    """
    latest = db.query(MarketState).order_by(MarketState.timestamp.desc()).first()
    if not latest:
        # No simulation data yet
        return [{"offset_hours": i, "predicted_demand_kwh": 0.0} for i in range(1, horizon_hours + 1)]
        
    current_time = latest.timestamp
    predictions = []
    
    for i in range(1, horizon_hours + 1):
        target_time = current_time + timedelta(hours=i)
        lookback_time = target_time - timedelta(hours=24)
        
        # Try to find the exact hour yesterday
        past_state = db.query(MarketState).filter(MarketState.timestamp == lookback_time).first()
        
        if past_state:
            pred_val = past_state.total_demand_kwh
            method = "24h_seasonal_lag"
        else:
            # Fallback flat trend
            pred_val = latest.total_demand_kwh
            method = "last_known"
            
        predictions.append({
            "target_time": target_time.isoformat(),
            "offset_hours": i,
            "predicted_demand_kwh": pred_val,
            "model": method
        })
        
    return predictions
