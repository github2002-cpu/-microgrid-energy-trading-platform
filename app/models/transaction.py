"""
SQLAlchemy ORM model for Transaction.

Records a completed trade between a buyer and seller household.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Transaction(Base):
    """
    An executed energy trade between two households.

    Created when the matching engine pairs a buy order with a sell order.
    """

    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    # ── Buyer ────────────────────────────────────────────────────
    buyer_household_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("households.id"), nullable=False, index=True
    )
    buyer_household: Mapped["Household"] = relationship(
        "Household",
        foreign_keys=[buyer_household_id],
        back_populates="buy_transactions",
    )

    # ── Seller ───────────────────────────────────────────────────
    seller_household_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("households.id"), nullable=False, index=True
    )
    seller_household: Mapped["Household"] = relationship(
        "Household",
        foreign_keys=[seller_household_id],
        back_populates="sell_transactions",
    )

    # ── Originating orders ───────────────────────────────────────
    buy_order_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("orders.id"), nullable=False
    )
    buy_order: Mapped["Order"] = relationship(
        "Order",
        foreign_keys=[buy_order_id],
        back_populates="buy_transactions",
    )

    sell_order_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("orders.id"), nullable=False
    )
    sell_order: Mapped["Order"] = relationship(
        "Order",
        foreign_keys=[sell_order_id],
        back_populates="sell_transactions",
    )

    # ── Trade details ────────────────────────────────────────────
    quantity_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    price_per_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    total_value: Mapped[float] = mapped_column(Float, nullable=False)

    # ── Timestamp ────────────────────────────────────────────────
    executed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # ── Constraints ──────────────────────────────────────────────
    __table_args__ = (
        CheckConstraint("quantity_kwh > 0", name="ck_txn_quantity_positive"),
        CheckConstraint("price_per_kwh >= 0", name="ck_txn_price_nonneg"),
        CheckConstraint("total_value >= 0", name="ck_txn_total_nonneg"),
        CheckConstraint(
            "buyer_household_id != seller_household_id",
            name="ck_txn_no_self_trade",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<Transaction {self.quantity_kwh}kWh "
            f"@{self.price_per_kwh}/kWh buyer={self.buyer_household_id}>"
        )
