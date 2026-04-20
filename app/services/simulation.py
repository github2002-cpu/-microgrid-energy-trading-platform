"""
Simulation service — energy generation, consumption, and battery engine.

Produces one EnergyLog record per household per simulation step.
Handles battery charge/discharge and grid import/export.
Trading and AI features are NOT implemented here yet.
"""

import math
import random
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.household import Household
from app.models.energy_log import EnergyLog

@dataclass
class SimulationConfig:
    battery_override: float | None = None
    demand_multiplier: float = 1.0
    supply_multiplier: float = 1.0
    price_volatility: float = 1.0

GLOBAL_SIM_CONFIG = SimulationConfig()


# ─────────────────────────────────────────────────────────────────
# Solar generation curve
# ─────────────────────────────────────────────────────────────────

def _solar_factor(hour: float) -> float:
    """
    Return a 0.0–1.0 factor representing solar irradiance at a given
    fractional hour of the day.

    Uses a shifted sine curve that peaks around 13:00 (solar noon ≈
    1 PM with atmospheric lag) and is zero from sunset to sunrise.

        sunrise ≈ 06:00    sunset ≈ 19:00    peak ≈ 13:00

    Outside the 06–19 window the factor is 0.
    """
    SUNRISE = 6.0
    SUNSET = 19.0

    if hour < SUNRISE or hour >= SUNSET:
        return 0.0

    # Map [SUNRISE, SUNSET] → [0, π] so that sin peaks at solar noon
    phase = (hour - SUNRISE) / (SUNSET - SUNRISE) * math.pi
    return max(0.0, math.sin(phase))


def calculate_solar_generation(
    hour: float,
    solar_capacity_kw: float,
    noise_pct: float = 0.10,
) -> float:
    """
    Calculate solar energy generated (kWh) for one simulation step.

    Parameters
    ----------
    hour : float
        Current hour of day (0.0–23.99).
    solar_capacity_kw : float
        Installed solar panel capacity in kW.
    noise_pct : float
        Maximum random noise as a fraction (e.g. 0.10 = ±10 %).

    Returns
    -------
    float
        Generated energy in kWh (≥ 0).
    """
    base = _solar_factor(hour) * solar_capacity_kw
    noise = random.uniform(-noise_pct, noise_pct)
    return max(0.0, round(base * (1 + noise), 4))


# ─────────────────────────────────────────────────────────────────
# Consumption profiles
# ─────────────────────────────────────────────────────────────────

# Each profile maps 24 hour-slots to a relative consumption weight.
# Weights are normalised so the *shape* matters, not the absolute values.

_RESIDENTIAL_PROFILE: list[float] = [
    # 0   1     2     3     4     5     6     7     8     9    10    11
    0.3, 0.2, 0.2, 0.2, 0.2, 0.3, 0.6, 0.9, 0.7, 0.5, 0.4, 0.4,
    # 12  13    14    15    16    17    18    19    20    21    22    23
    0.5, 0.5, 0.4, 0.4, 0.5, 0.7, 1.0, 1.0, 0.9, 0.7, 0.5, 0.4,
]

_COMMERCIAL_PROFILE: list[float] = [
    # 0   1     2     3     4     5     6     7     8     9    10    11
    0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.3, 0.6, 0.9, 1.0, 1.0, 1.0,
    # 12  13    14    15    16    17    18    19    20    21    22    23
    0.9, 1.0, 1.0, 1.0, 1.0, 0.8, 0.4, 0.2, 0.1, 0.1, 0.1, 0.1,
]

_INDUSTRIAL_PROFILE: list[float] = [
    # 0   1     2     3     4     5     6     7     8     9    10    11
    0.6, 0.6, 0.6, 0.6, 0.6, 0.7, 0.8, 0.9, 1.0, 1.0, 1.0, 1.0,
    # 12  13    14    15    16    17    18    19    20    21    22    23
    0.9, 1.0, 1.0, 1.0, 1.0, 0.9, 0.8, 0.7, 0.6, 0.6, 0.6, 0.6,
]

_PROFILES: dict[str, list[float]] = {
    "residential": _RESIDENTIAL_PROFILE,
    "commercial": _COMMERCIAL_PROFILE,
    "industrial": _INDUSTRIAL_PROFILE,
}

# Base average consumption in kW per household type.
# These are multiplied by the hourly weight to give instantaneous load.
_BASE_LOAD_KW: dict[str, float] = {
    "residential": 1.5,
    "commercial": 5.0,
    "industrial": 15.0,
}


def calculate_consumption(
    hour: float,
    household_type: str,
    noise_pct: float = 0.15,
) -> float:
    """
    Calculate energy consumed (kWh) for one simulation step.

    Parameters
    ----------
    hour : float
        Current hour of day (0.0–23.99).
    household_type : str
        One of "residential", "commercial", "industrial".
    noise_pct : float
        Maximum random noise as a fraction (default ±15 %).

    Returns
    -------
    float
        Consumed energy in kWh (≥ 0).
    """
    profile = _PROFILES.get(household_type, _RESIDENTIAL_PROFILE)
    base_kw = _BASE_LOAD_KW.get(household_type, 1.5)

    hour_index = int(hour) % 24
    weight = profile[hour_index]

    load = base_kw * weight
    noise = random.uniform(-noise_pct, noise_pct)
    return max(0.0, round(load * (1 + noise), 4))


# ─────────────────────────────────────────────────────────────────
# Battery logic
# ─────────────────────────────────────────────────────────────────

# Minimum state-of-charge as a fraction of capacity.
# The battery will not discharge below this threshold.
BATTERY_MIN_SOC_FRACTION = 0.10  # 10 %


@dataclass
class BatteryResult:
    """Intermediate result from battery processing."""

    charge_kwh: float       # energy charged into battery this step
    discharge_kwh: float    # energy discharged from battery this step
    level_kwh: float        # battery level after this step
    grid_import_kwh: float  # energy imported from grid (unmet deficit)
    grid_export_kwh: float  # energy exported to grid (excess surplus)


def _process_battery(
    net_kwh: float,
    battery_capacity_kwh: float,
    battery_level_kwh: float,
) -> BatteryResult:
    """
    Resolve net energy through the battery, then the grid.

    Rules
    -----
    **Surplus (net > 0)**:
      1. Charge the battery with as much surplus as capacity allows.
      2. Anything left over is exported to the grid.

    **Deficit (net < 0)**:
      1. Discharge the battery to cover the shortfall, but never
         below ``BATTERY_MIN_SOC_FRACTION × capacity``.
      2. Any remaining deficit is imported from the grid.

    Parameters
    ----------
    net_kwh : float
        generated − consumed (positive = surplus, negative = deficit).
    battery_capacity_kwh : float
        Total battery capacity in kWh.
    battery_level_kwh : float
        Current battery charge level in kWh.

    Returns
    -------
    BatteryResult
    """
    charge = 0.0
    discharge = 0.0
    grid_import = 0.0
    grid_export = 0.0

    min_level = battery_capacity_kwh * BATTERY_MIN_SOC_FRACTION
    headroom = max(0.0, battery_capacity_kwh - battery_level_kwh)
    available = max(0.0, battery_level_kwh - min_level)

    if net_kwh > 0:
        # ── surplus: charge battery, export remainder ────────────
        charge = min(net_kwh, headroom)
        grid_export = round(net_kwh - charge, 4)
    elif net_kwh < 0:
        # ── deficit: discharge battery, import remainder ─────────
        shortfall = abs(net_kwh)
        discharge = min(shortfall, available)
        grid_import = round(shortfall - discharge, 4)

    new_level = round(battery_level_kwh + charge - discharge, 4)

    return BatteryResult(
        charge_kwh=round(charge, 4),
        discharge_kwh=round(discharge, 4),
        level_kwh=new_level,
        grid_import_kwh=grid_import,
        grid_export_kwh=grid_export,
    )


# ─────────────────────────────────────────────────────────────────
# Simulation step
# ─────────────────────────────────────────────────────────────────

def run_simulation_step(
    db: Session,
    sim_time: datetime | None = None,
) -> list[EnergyLog]:
    """
    Execute one simulation tick for every household in the database.

    For each household:
      1. Calculate solar generation based on hour & panel capacity.
      2. Calculate consumption based on hour & household type.
      3. Compute net = generated − consumed.
      4. Process battery: charge on surplus, discharge on deficit.
      5. Compute grid import / export for anything the battery
         cannot absorb or supply.
      6. Update the household's battery_soc_pct.
      7. Insert an EnergyLog record.

    Parameters
    ----------
    db : Session
        Active SQLAlchemy database session.
    sim_time : datetime, optional
        The simulation timestamp to use.  Defaults to UTC now.

    Returns
    -------
    list[EnergyLog]
        The EnergyLog records created during this step.
    """
    if sim_time is None:
        sim_time = datetime.now(timezone.utc)

    hour = sim_time.hour + sim_time.minute / 60.0

    households = db.query(Household).all()
    logs: list[EnergyLog] = []

    for hh in households:
        generated = calculate_solar_generation(hour, hh.solar_capacity_kw) * GLOBAL_SIM_CONFIG.supply_multiplier
        consumed = calculate_consumption(hour, hh.household_type) * GLOBAL_SIM_CONFIG.demand_multiplier
        net = round(generated - consumed, 4)

        # ── Battery processing ───────────────────────────────────
        if GLOBAL_SIM_CONFIG.battery_override is not None:
            hh.battery_soc_pct = GLOBAL_SIM_CONFIG.battery_override

        # Derive current battery level in kWh from stored percentage
        current_level_kwh = hh.battery_capacity_kwh * hh.battery_soc_pct / 100.0

        bat = _process_battery(
            net_kwh=net,
            battery_capacity_kwh=hh.battery_capacity_kwh,
            battery_level_kwh=current_level_kwh,
        )

        # Persist updated battery state on the household
        if hh.battery_capacity_kwh > 0:
            hh.battery_soc_pct = round(
                bat.level_kwh / hh.battery_capacity_kwh * 100.0, 2
            )
        else:
            hh.battery_soc_pct = 0.0

        # ── Record ───────────────────────────────────────────────
        log = EnergyLog(
            household_id=hh.id,
            timestamp=sim_time,
            generated_kwh=generated,
            consumed_kwh=consumed,
            net_kwh=net,
            battery_charge_kwh=bat.charge_kwh,
            battery_discharge_kwh=bat.discharge_kwh,
            battery_level_kwh=bat.level_kwh,
            grid_import_kwh=bat.grid_import_kwh,
            grid_export_kwh=bat.grid_export_kwh,
            # AI predictions — not yet implemented
            predicted_demand_kwh=0.0,
            predicted_supply_kwh=0.0,
            # Market price — not yet implemented
            market_price_per_kwh=0.0,
        )

        db.add(log)
        logs.append(log)

    db.commit()

    # Refresh to populate server-side defaults (id, etc.)
    for log in logs:
        db.refresh(log)

    return logs
