"""
SQLAlchemy ORM model for EnergyLog.

Captures per-household energy readings at each simulation tick.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class EnergyLog(Base):
    """
    A single energy reading for a household at a point in time.

    Tracks generation, consumption, battery activity, grid interaction,
    and AI predictions — all in one row per tick.
    """

    __tablename__ = "energy_logs"

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
        "Household", back_populates="energy_logs"
    )

    # ── Timestamp ────────────────────────────────────────────────
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # ── Generation & consumption ─────────────────────────────────
    generated_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    consumed_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    net_kwh: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # ── Battery ──────────────────────────────────────────────────
    battery_charge_kwh: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )
    battery_discharge_kwh: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )
    battery_level_kwh: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )

    # ── Grid interaction ─────────────────────────────────────────
    grid_import_kwh: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )
    grid_export_kwh: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )

    # ── AI predictions (filled by forecasting layer) ─────────────
    predicted_demand_kwh: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )
    predicted_supply_kwh: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )

    # ── Market context ───────────────────────────────────────────
    market_price_per_kwh: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )

    # ── Constraints ──────────────────────────────────────────────
    __table_args__ = (
        CheckConstraint("generated_kwh >= 0", name="ck_energy_generated_nonneg"),
        CheckConstraint("consumed_kwh >= 0", name="ck_energy_consumed_nonneg"),
        CheckConstraint(
            "battery_charge_kwh >= 0", name="ck_energy_bat_charge_nonneg"
        ),
        CheckConstraint(
            "battery_discharge_kwh >= 0", name="ck_energy_bat_discharge_nonneg"
        ),
        CheckConstraint("battery_level_kwh >= 0", name="ck_energy_bat_level_nonneg"),
        CheckConstraint("grid_import_kwh >= 0", name="ck_energy_grid_import_nonneg"),
        CheckConstraint("grid_export_kwh >= 0", name="ck_energy_grid_export_nonneg"),
        CheckConstraint(
            "market_price_per_kwh >= 0", name="ck_energy_market_price_nonneg"
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<EnergyLog household={self.household_id} "
            f"t={self.timestamp} net={self.net_kwh}kWh>"
        )
