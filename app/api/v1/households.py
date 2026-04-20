"""
API v1 router for Household endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.household import Household

router = APIRouter(prefix="/households", tags=["Households"])


@router.get("/")
def list_households(db: Session = Depends(get_db)):
    """List all registered households in the microgrid."""
    hhs = db.query(Household).all()
    return [{
        "id": h.id,
        "name": h.name,
        "type": h.household_type,
        "solar_capacity_kw": h.solar_capacity_kw,
        "battery_capacity_kwh": h.battery_capacity_kwh,
        "grid_zone": h.grid_zone
    } for h in hhs]


@router.get("/{household_id}/battery")
def get_household_battery(household_id: str, db: Session = Depends(get_db)):
    """Fetch the real-time battery status for a specific household."""
    hh = db.query(Household).filter(Household.id == household_id).first()
    if not hh:
        raise HTTPException(status_code=404, detail="Household not found")
        
    current_charge_kwh = hh.battery_capacity_kwh * (hh.battery_soc_pct / 100.0)
    
    return {
        "household_id": hh.id,
        "name": hh.name,
        "battery_capacity_kwh": hh.battery_capacity_kwh,
        "battery_soc_pct": round(hh.battery_soc_pct, 2),
        "current_charge_kwh": round(current_charge_kwh, 2)
    }
