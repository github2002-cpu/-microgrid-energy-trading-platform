"""
Pydantic schemas for EnergyLog.
"""

from datetime import datetime

from pydantic import BaseModel, Field


# ── Shared fields ────────────────────────────────────────────────
class EnergyLogBase(BaseModel):
    """Fields common to create and read operations."""

    generated_kwh: float = Field(default=0.0, ge=0, examples=[3.2])
    consumed_kwh: float = Field(default=0.0, ge=0, examples=[1.8])
    net_kwh: float = Field(default=0.0, examples=[1.4])
    battery_charge_kwh: float = Field(default=0.0, ge=0, examples=[0.5])
    battery_discharge_kwh: float = Field(default=0.0, ge=0, examples=[0.0])
    battery_level_kwh: float = Field(default=0.0, ge=0, examples=[6.5])
    grid_import_kwh: float = Field(default=0.0, ge=0, examples=[0.0])
    grid_export_kwh: float = Field(default=0.0, ge=0, examples=[0.9])
    predicted_demand_kwh: float = Field(default=0.0, ge=0, examples=[2.0])
    predicted_supply_kwh: float = Field(default=0.0, ge=0, examples=[3.5])
    market_price_per_kwh: float = Field(default=0.0, ge=0, examples=[0.12])


# ── Create ───────────────────────────────────────────────────────
class EnergyLogCreate(EnergyLogBase):
    """Payload for recording a new energy log entry."""

    household_id: str = Field(..., examples=["uuid-of-household"])
    timestamp: datetime | None = None  # defaults to now on the server


# ── Response ─────────────────────────────────────────────────────
class EnergyLogResponse(EnergyLogBase):
    """Energy log data returned to the client."""

    id: str
    household_id: str
    timestamp: datetime

    model_config = {"from_attributes": True}
