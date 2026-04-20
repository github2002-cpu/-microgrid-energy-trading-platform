"""
API v1 router for Historical Data viewer.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.market_state import MarketState
from app.models.transaction import Transaction

router = APIRouter(prefix="/history", tags=["History"])

@router.get("/")
def get_historical_market_data(hours: int = 24, db: Session = Depends(get_db)):
    """Fetch past market states including trades for the historical data viewer."""
    states = db.query(MarketState).order_by(MarketState.timestamp.desc()).limit(hours).all()
    
    if not states:
        return []
        
    start_time = states[-1].timestamp
    txns = db.query(Transaction).filter(Transaction.executed_at >= start_time).all()
    
    txns_by_time = {}
    for t in txns:
        ts = t.executed_at.isoformat()
        if ts not in txns_by_time:
            txns_by_time[ts] = []
        txns_by_time[ts].append({
            "id": str(t.id),
            "buyer_id": str(t.buyer_household_id),
            "seller_id": str(t.seller_household_id),
            "quantity_kwh": t.quantity_kwh,
            "price_per_kwh": t.price_per_kwh
        })
        
    states.reverse() # chronological order
    
    return [{
        "timestamp": s.timestamp.isoformat(),
        "clearing_price": s.current_price_per_kwh,
        "supply": s.total_supply_kwh,
        "demand": s.total_demand_kwh,
        "trades": txns_by_time.get(s.timestamp.isoformat(), [])
    } for s in states]
