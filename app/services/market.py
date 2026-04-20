"""
Market service — dynamic pricing, order generation, matching orchestration.

Implements a supply/demand-driven equilibrium pricing model with:
  • Smooth price curve responding to imbalance ratio
  • Min/max price bounds
  • Household price sensitivity (urgency-aware bidding)
  • Clearing price fed into matching execution
  • Tick-to-tick price memory for smooth transitions
"""

import math
import random
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.energy_log import EnergyLog
from app.models.market_state import MarketState
from app.models.transaction import Transaction
from app.services.trading import place_order, run_matching


# ═════════════════════════════════════════════════════════════════
# Pricing model configuration
# ═════════════════════════════════════════════════════════════════

BASE_PRICE = 0.12           # $/kWh — equilibrium when supply == demand
MIN_PRICE = 0.03            # $/kWh — floor (prevents free energy)
MAX_PRICE = 0.35            # $/kWh — ceiling (regulatory cap)
PRICE_SENSITIVITY = 1.8     # steepness of the price curve
SMOOTHING_FACTOR = 0.2      # how much the new price blends with the old
                            # (0 = all old, 1 = all new)
PRICE_NOISE_STD = 0.01      # std dev for Gaussian noise on clearing price

# Module-level state: remembers last tick's clearing price
_last_clearing_price: float = BASE_PRICE


def compute_clearing_price(
    total_supply: float,
    total_demand: float,
) -> float:
    """
    Derive a clearing price from aggregate supply and demand.

    Uses a **sigmoid-style** curve centred on the base price:
      • supply == demand  → price ≈ base
      • demand >> supply  → price rises toward MAX_PRICE
      • supply >> demand  → price drops toward MIN_PRICE

    The imbalance ratio ``r = (demand − supply) / (demand + supply)``
    ranges from -1 (pure supply) to +1 (pure demand).  The price is
    mapped through a compressed tanh to stay within [MIN, MAX].

    Parameters
    ----------
    total_supply : float   Aggregate grid export across all households (kWh)
    total_demand : float   Aggregate grid import across all households (kWh)

    Returns
    -------
    float   Clearing price in $/kWh, clamped to [MIN_PRICE, MAX_PRICE]
    """
    total = total_supply + total_demand
    if total < 1e-6:
        return BASE_PRICE

    # imbalance: +1 = pure demand, −1 = pure supply
    imbalance = (total_demand - total_supply) / total

    # Shift base price using tanh(sensitivity × imbalance)
    # tanh output is in (−1, 1), giving smooth S-curve between bounds
    shift = math.tanh(PRICE_SENSITIVITY * imbalance)

    if shift >= 0:
        # Demand exceeds supply → price rises from base toward max
        price = BASE_PRICE + shift * (MAX_PRICE - BASE_PRICE)
    else:
        # Supply exceeds demand → price drops from base toward min
        price = BASE_PRICE + shift * (BASE_PRICE - MIN_PRICE)

    # 1. Add price volatility (Gaussian noise)
    from app.services.simulation import GLOBAL_SIM_CONFIG
    noise = random.gauss(0, PRICE_NOISE_STD * GLOBAL_SIM_CONFIG.price_volatility)
    price += noise

    return round(max(MIN_PRICE, min(MAX_PRICE, price)), 4)


def get_smoothed_price(
    new_price: float,
    previous_price: float | None = None,
) -> float:
    """
    Blend the newly computed price with the previous tick's price
    to prevent jarring jumps between ticks.

    result = α × new  +  (1 − α) × old
    """
    global _last_clearing_price

    if previous_price is None:
        previous_price = _last_clearing_price

    smoothed = SMOOTHING_FACTOR * new_price + (1 - SMOOTHING_FACTOR) * previous_price
    smoothed = round(max(MIN_PRICE, min(MAX_PRICE, smoothed)), 4)

    _last_clearing_price = smoothed
    return smoothed


def reset_price_memory() -> None:
    """Reset the price history (e.g. at the start of a new simulation)."""
    global _last_clearing_price
    _last_clearing_price = BASE_PRICE


# ═════════════════════════════════════════════════════════════════
# Household price sensitivity
# ═════════════════════════════════════════════════════════════════

# Grid pricing penalties
# Grid import is more expensive than market, export is cheaper.
GRID_IMPORT_FACTOR = 1.2
GRID_EXPORT_FACTOR = 0.8

# Urgency multipliers: how far from market price households bid/ask.
# Higher urgency → willingness to accept worse prices to ensure a fill.

# Sellers: ask below clearing price down to the grid export price.
SELLER_NOISE = 0.03

# Buyers: bid above clearing price up to the grid import price.
BUYER_NOISE = 0.03

MIN_ORDER_KWH = 0.01            # minimum order size to avoid dust


def _seller_price(clearing_price: float, urgency: float) -> float:
    """
    Compute a sell order's limit price based on clearing price and urgency.
    
    Minimum accepted price is the grid export price (clearing * 0.8).
    """
    grid_export_price = clearing_price * GRID_EXPORT_FACTOR
    # price ranges from clearing_price (urg=0) to grid_export_price (urg=1)
    base_ask = clearing_price - (clearing_price - grid_export_price) * urgency
    noise = random.uniform(-SELLER_NOISE, SELLER_NOISE)
    return round(max(MIN_PRICE, base_ask * (1 + noise)), 4)


def _buyer_price(clearing_price: float, urgency: float) -> float:
    """
    Compute a buy order's limit price based on clearing price and urgency.

    Maximum accepted bid is the grid import price (clearing * 1.2).
    """
    grid_import_price = clearing_price * GRID_IMPORT_FACTOR
    # price ranges from clearing_price (urg=0) to grid_import_price (urg=1)
    base_bid = clearing_price + (grid_import_price - clearing_price) * urgency
    noise = random.uniform(-BUYER_NOISE, BUYER_NOISE)
    return round(max(MIN_PRICE, min(MAX_PRICE, base_bid * (1 + noise))), 4)


def _urgency(quantity: float, capacity: float) -> float:
    """
    Compute a 0–1 urgency factor.

    Urgency increases with the quantity relative to the household's
    typical capacity (solar for sellers, base load for buyers).
    Capped at 1.0.
    """
    if capacity <= 0:
        return 0.5
    return min(1.0, quantity / capacity)


# ═════════════════════════════════════════════════════════════════
# Order generation from simulation
# ═════════════════════════════════════════════════════════════════

def generate_orders_from_logs(
    db: Session,
    energy_logs: list[EnergyLog],
    clearing_price: float,
    created_at: datetime | None = None,
) -> int:
    """
    Convert simulation energy logs into buy/sell orders with
    price-sensitive bidding.

    Rules
    -----
    - **grid_export > 0** → SELL order.  Price = clearing × (1 − undercut).
      Urgency scales with export relative to solar capacity.
    - **grid_import > 0** → BUY order.  Price = clearing × (1 + overbid).
      Urgency scales with import relative to base consumption.
    - Households with no grid interaction place no orders.

    Returns
    -------
    int   Number of orders placed.
    """
    if created_at is None:
        created_at = datetime.now(timezone.utc)

    count = 0
    for log in energy_logs:
        hh = log.household  # loaded via selectin relationship

        if log.grid_export_kwh >= MIN_ORDER_KWH:
            urg = _urgency(log.grid_export_kwh, hh.solar_capacity_kw)
            sell_price = _seller_price(clearing_price, urg)
            place_order(
                db,
                household_id=hh.id,
                order_type="sell",
                quantity_kwh=log.grid_export_kwh,
                price_limit=sell_price,
                created_at=created_at,
            )
            count += 1

        elif log.grid_import_kwh >= MIN_ORDER_KWH:
            urg = _urgency(log.grid_import_kwh, hh.battery_capacity_kwh)
            buy_price = _buyer_price(clearing_price, urg)
            place_order(
                db,
                household_id=hh.id,
                order_type="buy",
                quantity_kwh=log.grid_import_kwh,
                price_limit=buy_price,
                created_at=created_at,
            )
            count += 1

    if count > 0:
        db.flush()

    return count


# ═════════════════════════════════════════════════════════════════
# Market state snapshot
# ═════════════════════════════════════════════════════════════════

def record_market_state(
    db: Session,
    energy_logs: list[EnergyLog],
    transactions: list[Transaction],
    clearing_price: float,
    sim_time: datetime | None = None,
) -> MarketState:
    """
    Compute and persist an aggregate market state snapshot.

    If transactions occurred, the reported price is the
    volume-weighted average price (VWAP).  Otherwise the
    clearing price derived from supply/demand is used.
    """
    if sim_time is None:
        sim_time = datetime.now(timezone.utc)

    total_supply = round(sum(l.grid_export_kwh for l in energy_logs), 4)
    total_demand = round(sum(l.grid_import_kwh for l in energy_logs), 4)
    matched_volume = round(sum(t.quantity_kwh for t in transactions), 4)

    if transactions:
        total_value = sum(t.quantity_kwh * t.price_per_kwh for t in transactions)
        vwap = round(total_value / matched_volume, 4) if matched_volume > 0 else clearing_price
        prices = [t.price_per_kwh for t in transactions]
        min_p = round(min(prices), 4)
        max_p = round(max(prices), 4)
    else:
        vwap = clearing_price
        min_p = clearing_price
        max_p = clearing_price

    status = "open" if (total_supply > 0 or total_demand > 0) else "closed"

    ms = MarketState(
        timestamp=sim_time,
        total_supply_kwh=total_supply,
        total_demand_kwh=total_demand,
        matched_volume_kwh=matched_volume,
        current_price_per_kwh=vwap,
        min_price=min_p,
        max_price=max_p,
        market_status=status,
    )
    db.add(ms)
    return ms


# ═════════════════════════════════════════════════════════════════
# Full market tick
# ═════════════════════════════════════════════════════════════════

def run_market_tick(
    db: Session,
    energy_logs: list[EnergyLog],
    sim_time: datetime | None = None,
) -> dict:
    """
    Complete market cycle for one simulation tick:

      1. Aggregate supply/demand from energy logs.
      2. Compute raw clearing price from equilibrium curve.
      3. Smooth price with previous tick's price.
      4. Generate buy/sell orders with price-sensitive bidding.
      5. Run the matching engine.
      6. Record aggregate market state (VWAP if trades occurred).
      7. Update energy logs with the realised market price.
      8. Commit all changes.

    Returns
    -------
    dict with keys:
        orders_placed, transactions, market_state, clearing_price
    """
    if sim_time is None:
        sim_time = datetime.now(timezone.utc)

    # 1. Aggregate supply / demand
    total_supply = sum(l.grid_export_kwh for l in energy_logs)
    total_demand = sum(l.grid_import_kwh for l in energy_logs)

    # 2–3. Compute and smooth clearing price
    raw_price = compute_clearing_price(total_supply, total_demand)
    clearing_price = get_smoothed_price(raw_price)

    # 4. Generate orders with price sensitivity
    orders_placed = generate_orders_from_logs(
        db, energy_logs, clearing_price, created_at=sim_time,
    )

    # 5. Match orders
    transactions = run_matching(db, executed_at=sim_time)

    # 6. Record market state
    market_state = record_market_state(
        db, energy_logs, transactions, clearing_price, sim_time,
    )

    # 7. Update energy logs with realised price
    for log in energy_logs:
        log.market_price_per_kwh = market_state.current_price_per_kwh

    # 8. Commit everything
    db.commit()
    db.refresh(market_state)

    return {
        "orders_placed": orders_placed,
        "transactions": transactions,
        "market_state": market_state,
        "clearing_price": clearing_price,
    }
