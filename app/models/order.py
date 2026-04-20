"""
SQLAlchemy ORM model for Order.

Represents a buy or sell order placed by a household on the order book.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, Float, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Order(Base):
    """
    A buy or sell limit/market order from a household.

    Tracks original quantity, remaining quantity (for partial fills),
    price limit, and lifecycle status.
    """

    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    # ── Foreign key ──────────────────────────────────────────────
    household_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("households.id"), nullable=False, index=True
    )
    household: Mapped["Household"] = relationship(
        "Household", back_populates="orders"
    )

    # ── Order specification ──────────────────────────────────────
    order_type: Mapped[str] = mapped_column(
        String(10), nullable=False
    )  # buy | sell
    quantity_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    remaining_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    price_limit: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )  # null for market orders

    # ── Status ───────────────────────────────────────────────────
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="open"
    )  # open | partial | matched | cancelled | completed

    # ── Timestamps ───────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # ── Relationships ────────────────────────────────────────────
    # Orders that acted as the buy-side of a transaction
    buy_transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction",
        foreign_keys="Transaction.buy_order_id",
        back_populates="buy_order",
        lazy="selectin",
    )
    # Orders that acted as the sell-side of a transaction
    sell_transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction",
        foreign_keys="Transaction.sell_order_id",
        back_populates="sell_order",
        lazy="selectin",
    )

    # ── Constraints ──────────────────────────────────────────────
    __table_args__ = (
        CheckConstraint("quantity_kwh > 0", name="ck_order_quantity_positive"),
        CheckConstraint("remaining_kwh >= 0", name="ck_order_remaining_nonneg"),
        CheckConstraint(
            "remaining_kwh <= quantity_kwh", name="ck_order_remaining_lte_qty"
        ),
        CheckConstraint(
            "price_limit IS NULL OR price_limit >= 0",
            name="ck_order_price_nonneg",
        ),
        CheckConstraint(
            "order_type IN ('buy', 'sell')", name="ck_order_type_enum"
        ),
        CheckConstraint(
            "status IN ('open', 'partial', 'matched', 'cancelled', 'completed')",
            name="ck_order_status_enum",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<Order {self.order_type} {self.quantity_kwh}kWh "
            f"@{self.price_limit} status={self.status}>"
        )
