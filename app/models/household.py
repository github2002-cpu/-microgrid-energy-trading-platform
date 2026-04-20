"""
SQLAlchemy ORM model for Household (prosumer unit).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Household(Base):
    """
    A prosumer household / building in the micro-grid.

    Each household has solar capacity, battery storage, and belongs
    to a grid zone. It is owned by a User.
    """

    __tablename__ = "households"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    grid_zone: Mapped[str] = mapped_column(
        String(100), nullable=False, default="zone-A"
    )
    household_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="residential"
    )  # residential | commercial | industrial

    # ── Energy specifications ────────────────────────────────────
    solar_capacity_kw: Mapped[float] = mapped_column(Float, default=0.0)
    battery_capacity_kwh: Mapped[float] = mapped_column(Float, default=0.0)
    battery_soc_pct: Mapped[float] = mapped_column(
        Float, default=50.0
    )  # current state of charge %

    # ── Ownership ────────────────────────────────────────────────
    owner_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    owner: Mapped["User"] = relationship("User", back_populates="households")

    # ── Reverse relationships ────────────────────────────────────
    energy_logs: Mapped[list["EnergyLog"]] = relationship(
        "EnergyLog", back_populates="household", lazy="selectin"
    )
    orders: Mapped[list["Order"]] = relationship(
        "Order", back_populates="household", lazy="selectin"
    )
    buy_transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction",
        foreign_keys="Transaction.buyer_household_id",
        back_populates="buyer_household",
        lazy="selectin",
    )
    sell_transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction",
        foreign_keys="Transaction.seller_household_id",
        back_populates="seller_household",
        lazy="selectin",
    )

    # ── Timestamps ───────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<Household {self.name} zone={self.grid_zone}>"
