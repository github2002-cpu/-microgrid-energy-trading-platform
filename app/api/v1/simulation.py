"""
API v1 router for Simulation endpoints.
"""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.market_state import MarketState
from app.services.market import run_market_tick
from app.services.simulation import run_simulation_step, GLOBAL_SIM_CONFIG
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/simulation", tags=["Simulation"])

class ScenarioUpdate(BaseModel):
    battery_level: Optional[float] = None
    demand_multiplier: float = 1.0
    supply_multiplier: float = 1.0
    price_volatility: float = 1.0

@router.post("/config")
def update_config(config: ScenarioUpdate):
    """
    Override background simulation modifiers in real-time.
    """
    GLOBAL_SIM_CONFIG.battery_override = config.battery_level
    GLOBAL_SIM_CONFIG.demand_multiplier = config.demand_multiplier
    GLOBAL_SIM_CONFIG.supply_multiplier = config.supply_multiplier
    GLOBAL_SIM_CONFIG.price_volatility = config.price_volatility
    return {"message": "Live scenario config updated"}



@router.post("/run")
def run_simulation(hours: int = 1, db: Session = Depends(get_db)):
    """
    Run the microgrid simulation for N hours.
    Continues from the last recorded tick or starts from the current hour.
    """
    if hours <= 0 or hours > 168:
        return {"error": "Hours must be between 1 and 168 (1 week)"}

    # Find the last simulated time to continue from it cleanly
    last_state = db.query(MarketState).order_by(MarketState.timestamp.desc()).first()
    if last_state:
        current_time = last_state.timestamp + timedelta(hours=1)
    else:
        current_time = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        
    results = []
    
    for _ in range(hours):
        # 1. Generate & consume energy
        logs = run_simulation_step(db, sim_time=current_time)
        
        # 2. Market tick (orders, matching, pricing)
        tick_result = run_market_tick(db, logs, sim_time=current_time)
        ms = tick_result["market_state"]
        
        results.append({
            "hour": current_time.isoformat(),
            "clearing_price": tick_result["clearing_price"],
            "vwap_price": ms.current_price_per_kwh,
            "total_supply": ms.total_supply_kwh,
            "total_demand": ms.total_demand_kwh,
            "matched_volume": ms.matched_volume_kwh,
            "transactions": len(tick_result["transactions"])
        })
        
        current_time += timedelta(hours=1)
        
    return {"message": f"Successfully simulated {hours} hours", "ticks": results}
