"""
Pydantic schemas for MarketState.
"""

from datetime import datetime

from pydantic import BaseModel, Field, model_validator


# ── Shared fields ────────────────────────────────────────────────
class MarketStateBase(BaseModel):
    """Fields common to create and read operations."""

    total_supply_kwh: float = Field(default=0.0, ge=0, examples=[120.5])
    total_demand_kwh: float = Field(default=0.0, ge=0, examples=[95.3])
    matched_volume_kwh: float = Field(default=0.0, ge=0, examples=[88.0])
    current_price_per_kwh: float = Field(default=0.0, ge=0, examples=[0.14])
    min_price: float = Field(default=0.0, ge=0, examples=[0.08])
    max_price: float = Field(default=0.0, ge=0, examples=[0.22])
    market_status: str = Field(
        default="open",
        pattern="^(open|closed|suspended)$",
        examples=["open"],
    )

    @model_validator(mode="after")
    def max_gte_min(self) -> "MarketStateBase":
        if self.max_price < self.min_price:
            raise ValueError("max_price must be >= min_price")
        return self


# ── Create ───────────────────────────────────────────────────────
class MarketStateCreate(MarketStateBase):
    """Payload for recording a new market state snapshot."""

    timestamp: datetime | None = None  # defaults to now on the server


# ── Response ─────────────────────────────────────────────────────
class MarketStateResponse(MarketStateBase):
    """Market state data returned to the client."""

    id: str
    timestamp: datetime

    model_config = {"from_attributes": True}
