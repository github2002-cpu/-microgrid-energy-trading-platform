"""
Trading service — order book matching engine.

Implements a continuous double-auction with price-time priority.
Supports partial fills and prevents self-trading.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.order import Order
from app.models.transaction import Transaction


# ─────────────────────────────────────────────────────────────────
# Order helpers
# ─────────────────────────────────────────────────────────────────

def place_order(
    db: Session,
    household_id: str,
    order_type: str,
    quantity_kwh: float,
    price_limit: float,
    created_at: datetime | None = None,
) -> Order:
    """
    Place a new buy or sell order onto the order book.

    Parameters
    ----------
    db : Session
    household_id : str
    order_type : str       "buy" or "sell"
    quantity_kwh : float   Must be > 0
    price_limit : float    Price ceiling (buy) or floor (sell) per kWh
    created_at : datetime  Optional; defaults to UTC now

    Returns
    -------
    Order   The newly created (uncommitted) order.
    """
    if created_at is None:
        created_at = datetime.now(timezone.utc)

    order = Order(
        household_id=household_id,
        order_type=order_type,
        quantity_kwh=round(quantity_kwh, 4),
        remaining_kwh=round(quantity_kwh, 4),
        price_limit=round(price_limit, 4),
        status="open",
        created_at=created_at,
    )
    db.add(order)
    return order


def cancel_order(db: Session, order: Order) -> None:
    """Cancel an open or partially filled order."""
    if order.status in ("open", "partial"):
        order.status = "cancelled"


# ─────────────────────────────────────────────────────────────────
# Matching engine
# ─────────────────────────────────────────────────────────────────

def _can_match(buy: Order, sell: Order) -> bool:
    """
    Two orders can match when:
      1. The buyer's price limit >= seller's price limit (price overlap).
      2. They belong to different households (no self-trade).
      3. Both still have remaining quantity.
    """
    if buy.household_id == sell.household_id:
        return False
    if buy.remaining_kwh <= 0 or sell.remaining_kwh <= 0:
        return False
    if buy.price_limit is None or sell.price_limit is None:
        # Market orders always match on price
        return True
    return buy.price_limit >= sell.price_limit


def _execution_price(buy: Order, sell: Order) -> float:
    """
    Determine the trade execution price.

    Uses the midpoint of the two limit prices.
    If one side is a market order, the other side's limit is used.
    """
    bp = buy.price_limit
    sp = sell.price_limit

    if bp is not None and sp is not None:
        return round((bp + sp) / 2.0, 4)
    if bp is not None:
        return bp
    if sp is not None:
        return sp
    return 0.0  # both market orders — edge case


def _update_order_status(order: Order) -> None:
    """Set order status based on remaining quantity."""
    if order.remaining_kwh <= 0:
        order.remaining_kwh = 0.0
        order.status = "matched"
    elif order.remaining_kwh < order.quantity_kwh:
        order.status = "partial"


def run_matching(
    db: Session,
    executed_at: datetime | None = None,
) -> list[Transaction]:
    """
    Run one round of order-book matching.

    Algorithm
    ---------
    1. Load all open/partial buy orders, sorted by price DESC (best
       buyer first), then by created_at ASC (time priority).
    2. Load all open/partial sell orders, sorted by price ASC (cheapest
       seller first), then by created_at ASC.
    3. Walk through buys and for each, try to fill against the best
       available sell(s).
    4. For each match, create a Transaction recording the trade.

    Parameters
    ----------
    db : Session
    executed_at : datetime, optional

    Returns
    -------
    list[Transaction]
        All trades executed in this matching round.
    """
    if executed_at is None:
        executed_at = datetime.now(timezone.utc)

    # Fetch open / partial orders sorted for price-time priority
    buy_orders = (
        db.query(Order)
        .filter(Order.order_type == "buy")
        .filter(Order.status.in_(["open", "partial"]))
        .filter(Order.remaining_kwh > 0)
        .order_by(Order.price_limit.desc(), Order.created_at.asc())
        .all()
    )

    sell_orders = (
        db.query(Order)
        .filter(Order.order_type == "sell")
        .filter(Order.status.in_(["open", "partial"]))
        .filter(Order.remaining_kwh > 0)
        .order_by(Order.price_limit.asc(), Order.created_at.asc())
        .all()
    )

    transactions: list[Transaction] = []

    for buy in buy_orders:
        if buy.remaining_kwh <= 0:
            continue

        for sell in sell_orders:
            if sell.remaining_kwh <= 0:
                continue
            if buy.remaining_kwh <= 0:
                break

            if not _can_match(buy, sell):
                continue

            # ── Determine fill quantity and price ────────────────
            fill_qty = round(min(buy.remaining_kwh, sell.remaining_kwh), 4)
            price = _execution_price(buy, sell)
            total = round(fill_qty * price, 4)

            # ── Update order quantities ──────────────────────────
            buy.remaining_kwh = round(buy.remaining_kwh - fill_qty, 4)
            sell.remaining_kwh = round(sell.remaining_kwh - fill_qty, 4)

            _update_order_status(buy)
            _update_order_status(sell)

            # ── Record transaction ───────────────────────────────
            txn = Transaction(
                buyer_household_id=buy.household_id,
                seller_household_id=sell.household_id,
                buy_order_id=buy.id,
                sell_order_id=sell.id,
                quantity_kwh=fill_qty,
                price_per_kwh=price,
                total_value=total,
                executed_at=executed_at,
            )
            db.add(txn)
            transactions.append(txn)

    if transactions:
        db.flush()

    return transactions
