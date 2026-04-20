"""
Pydantic schemas for Household.
"""

from datetime import datetime

from pydantic import BaseModel, Field


# ── Shared fields ────────────────────────────────────────────────
class HouseholdBase(BaseModel):
    """Fields common to create and read operations."""

    name: str = Field(..., max_length=255, examples=["Sunny Residence"])
    address: str | None = Field(default=None, examples=["42 Solar Lane, GridCity"])
    grid_zone: str = Field(default="zone-A", max_length=100, examples=["zone-A"])
    household_type: str = Field(
        default="residential",
        pattern="^(residential|commercial|industrial)$",
        examples=["residential"],
    )
    solar_capacity_kw: float = Field(default=0.0, ge=0, examples=[5.5])
    battery_capacity_kwh: float = Field(default=0.0, ge=0, examples=[13.5])
    battery_soc_pct: float = Field(default=50.0, ge=0, le=100, examples=[75.0])


# ── Create ───────────────────────────────────────────────────────
class HouseholdCreate(HouseholdBase):
    """Payload for registering a new household."""

    owner_id: str = Field(..., examples=["uuid-of-owner"])


# ── Update ───────────────────────────────────────────────────────
class HouseholdUpdate(BaseModel):
    """Payload for updating an existing household. All fields optional."""

    name: str | None = Field(default=None, max_length=255)
    address: str | None = None
    grid_zone: str | None = Field(default=None, max_length=100)
    household_type: str | None = Field(
        default=None, pattern="^(residential|commercial|industrial)$"
    )
    solar_capacity_kw: float | None = Field(default=None, ge=0)
    battery_capacity_kwh: float | None = Field(default=None, ge=0)
    battery_soc_pct: float | None = Field(default=None, ge=0, le=100)


# ── Response ─────────────────────────────────────────────────────
class HouseholdResponse(HouseholdBase):
    """Household data returned to the client."""

    id: str
    owner_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
