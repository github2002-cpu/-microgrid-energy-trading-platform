"""
Pydantic schemas for Order.
"""

from datetime import datetime

from pydantic import BaseModel, Field, model_validator


# ── Shared fields ────────────────────────────────────────────────
class OrderBase(BaseModel):
    """Fields common to create and read operations."""

    order_type: str = Field(
        ..., pattern="^(buy|sell)$", examples=["sell"]
    )
    quantity_kwh: float = Field(..., gt=0, examples=[5.0])
    price_limit: float | None = Field(
        default=None, ge=0, examples=[0.15]
    )  # null → market order


# ── Create ───────────────────────────────────────────────────────
class OrderCreate(OrderBase):
    """Payload for placing a new order."""

    household_id: str = Field(..., examples=["uuid-of-household"])


# ── Update ───────────────────────────────────────────────────────
class OrderUpdate(BaseModel):
    """Payload for updating an order (e.g. cancel)."""

    status: str | None = Field(
        default=None,
        pattern="^(open|partial|matched|cancelled|completed)$",
    )
    remaining_kwh: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def cancel_only_open(self) -> "OrderUpdate":
        """Basic validation — full business rules live in the service layer."""
        return self


# ── Response ─────────────────────────────────────────────────────
class OrderResponse(OrderBase):
    """Order data returned to the client."""

    id: str
    household_id: str
    remaining_kwh: float
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
