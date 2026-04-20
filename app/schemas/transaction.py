"""
Pydantic schemas for Transaction.
"""

from datetime import datetime

from pydantic import BaseModel, Field, model_validator


# ── Shared fields ────────────────────────────────────────────────
class TransactionBase(BaseModel):
    """Fields common to create and read operations."""

    quantity_kwh: float = Field(..., gt=0, examples=[3.5])
    price_per_kwh: float = Field(..., ge=0, examples=[0.14])
    total_value: float = Field(..., ge=0, examples=[0.49])


# ── Create ───────────────────────────────────────────────────────
class TransactionCreate(TransactionBase):
    """Payload for recording an executed trade."""

    buyer_household_id: str = Field(..., examples=["uuid-buyer"])
    seller_household_id: str = Field(..., examples=["uuid-seller"])
    buy_order_id: str = Field(..., examples=["uuid-buy-order"])
    sell_order_id: str = Field(..., examples=["uuid-sell-order"])

    @model_validator(mode="after")
    def no_self_trade(self) -> "TransactionCreate":
        if self.buyer_household_id == self.seller_household_id:
            raise ValueError("buyer and seller household must be different")
        return self


# ── Response ─────────────────────────────────────────────────────
class TransactionResponse(TransactionBase):
    """Transaction data returned to the client."""

    id: str
    buyer_household_id: str
    seller_household_id: str
    buy_order_id: str
    sell_order_id: str
    executed_at: datetime

    model_config = {"from_attributes": True}
