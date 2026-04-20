"""
SQLAlchemy ORM model for MarketState.

Captures aggregate market conditions at each simulation tick.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class MarketState(Base):
    """
    Snapshot of the micro-grid market at a point in time.

    One row per tick — tracks aggregate supply/demand, matched volume,
    and price bounds.
    """

    __tablename__ = "market_states"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    # ── Timestamp ────────────────────────────────────────────────
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # ── Aggregate volumes ────────────────────────────────────────
    total_supply_kwh: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )
    total_demand_kwh: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )
    matched_volume_kwh: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )

    # ── Pricing ──────────────────────────────────────────────────
    current_price_per_kwh: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )
    min_price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    max_price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # ── Status ───────────────────────────────────────────────────
    market_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="open"
    )  # open | closed | suspended

    # ── Constraints ──────────────────────────────────────────────
    __table_args__ = (
        CheckConstraint("total_supply_kwh >= 0", name="ck_market_supply_nonneg"),
        CheckConstraint("total_demand_kwh >= 0", name="ck_market_demand_nonneg"),
        CheckConstraint(
            "matched_volume_kwh >= 0", name="ck_market_matched_nonneg"
        ),
        CheckConstraint(
            "current_price_per_kwh >= 0", name="ck_market_price_nonneg"
        ),
        CheckConstraint("min_price >= 0", name="ck_market_min_price_nonneg"),
        CheckConstraint("max_price >= 0", name="ck_market_max_price_nonneg"),
        CheckConstraint("max_price >= min_price", name="ck_market_max_gte_min"),
        CheckConstraint(
            "market_status IN ('open', 'closed', 'suspended')",
            name="ck_market_status_enum",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<MarketState t={self.timestamp} "
            f"price={self.current_price_per_kwh} status={self.market_status}>"
        )
