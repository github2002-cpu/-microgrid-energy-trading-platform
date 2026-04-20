"""
API v1 router for Market data visualization endpoints.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.market_state import MarketState
from app.models.transaction import Transaction

router = APIRouter(prefix="/market", tags=["Market"])


@router.get("/state")
def get_latest_market_state(db: Session = Depends(get_db)):
    """Fetch the most recent market state (price, supply, demand)."""
    state: MarketState | None = db.query(MarketState).order_by(MarketState.timestamp.desc()).first()
    if not state:
        return {"message": "No market state available. Run the simulation first."}
        
    return {
        "timestamp": state.timestamp.isoformat(),
        "total_supply_kwh": state.total_supply_kwh,
        "total_demand_kwh": state.total_demand_kwh,
        "matched_volume_kwh": state.matched_volume_kwh,
        "current_price_per_kwh": state.current_price_per_kwh,
        "min_price": state.min_price,
        "max_price": state.max_price,
        "status": state.market_status
    }


@router.get("/history")
def get_market_history(limit: int = 24, db: Session = Depends(get_db)):
    """Fetch the historical market states for charting."""
    states = db.query(MarketState).order_by(MarketState.timestamp.desc()).limit(limit).all()
    states.reverse()  # Chronological order
    return [{
        "timestamp": s.timestamp.isoformat(),
        "price": s.current_price_per_kwh,
        "supply": s.total_supply_kwh,
        "demand": s.total_demand_kwh
    } for s in states]


@router.get("/transactions")
def get_transactions(limit: int = 50, db: Session = Depends(get_db)):
    """Fetch the most recent market transactions."""
    txns = db.query(Transaction).order_by(Transaction.executed_at.desc()).limit(limit).all()
    
    return [{
        "id": t.id,
        "buyer_id": t.buyer_household_id,
        "seller_id": t.seller_household_id,
        "quantity_kwh": t.quantity_kwh,
        "price_per_kwh": t.price_per_kwh,
        "total_value": t.total_value,
        "executed_at": t.executed_at.isoformat()
    } for t in txns]
