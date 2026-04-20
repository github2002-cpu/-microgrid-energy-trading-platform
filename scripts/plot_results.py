"""
Visualization script for the Micro-Grid simulation results.
Generates charts for Price, Supply vs Demand, and Trade volume over 24 hours.

Run this script from the project root using:
    PYTHONPATH=. python scripts/plot_results.py
"""

import sys
import os

try:
    import matplotlib.pyplot as plt
except ImportError:
    print("Error: matplotlib is not installed.")
    print("Install it by running: pip install matplotlib")
    sys.exit(1)

import logging
from datetime import datetime, timezone

# Suppress SQLAlchemy logs for clean output
logging.getLogger("sqlalchemy").setLevel(logging.WARNING)

# Import our platform models and services
import app.models # noqa: F401
from app.db.session import init_db, SessionLocal, Base
from app.models.user import User
from app.models.household import Household
from app.services.simulation import run_simulation_step
from app.services.market import run_market_tick, reset_price_memory


def setup_simulation_data(db):
    """Clean the DB and seed 5 distinct households for the 24h simulation."""
    # Clean previous test data
    for tbl in reversed(Base.metadata.sorted_tables):
        db.execute(tbl.delete())
    db.commit()

    user = User(email="admin@grid.io", full_name="Admin", hashed_password="x", role="admin")
    db.add(user)
    db.flush()

    households = [
        Household(name="ResA (small)",   owner_id=user.id, household_type="residential", solar_capacity_kw=3.0,  battery_capacity_kwh=5.0,  battery_soc_pct=20, grid_zone="zone-A"),
        Household(name="ResB (large)",   owner_id=user.id, household_type="residential", solar_capacity_kw=8.0,  battery_capacity_kwh=13.5, battery_soc_pct=20, grid_zone="zone-A"),
        Household(name="Office (mid)",   owner_id=user.id, household_type="commercial",  solar_capacity_kw=25.0, battery_capacity_kwh=20.0, battery_soc_pct=20, grid_zone="zone-A"),
        Household(name="Factory",        owner_id=user.id, household_type="industrial",  solar_capacity_kw=40.0, battery_capacity_kwh=30.0, battery_soc_pct=20, grid_zone="zone-B"),
        Household(name="Shop (no solar)",owner_id=user.id, household_type="commercial",  solar_capacity_kw=0.0,  battery_capacity_kwh=5.0,  battery_soc_pct=20, grid_zone="zone-B"),
    ]
    db.add_all(households)
    db.commit()


def main():
    print("Initializing database...")
    init_db()
    db = SessionLocal()

    print("Seeding households...")
    setup_simulation_data(db)
    reset_price_memory()

    print("Running 24-hour simulation...")
    hours = []
    prices = []
    supplies = []
    demands = []
    trade_counts = []

    for h in range(24):
        sim_time = datetime(2026, 3, 22, h, 0, 0, tzinfo=timezone.utc)
        
        # 1. Run generation/consumption/battery logic
        logs = run_simulation_step(db, sim_time=sim_time)
        # 2. Run market matching & pricing
        result = run_market_tick(db, logs, sim_time=sim_time)
        
        ms = result["market_state"]
        trades = result["transactions"]
        
        # Collect data for plotting
        hours.append(h)
        prices.append(ms.current_price_per_kwh)
        supplies.append(ms.total_supply_kwh)
        demands.append(ms.total_demand_kwh)
        trade_counts.append(len(trades))
        
        # Print progress bar
        sys.stdout.write(f"\rSimulating hour {h:02d}/23...")
        sys.stdout.flush()

    print("\nSimulation complete. Generating plots...")
    
    # ── Create the Plots ─────────────────────────────────────────
    
    # Create a 3-row, 1-column figure
    fig, axes = plt.subplots(3, 1, figsize=(10, 12), sharex=True)
    fig.suptitle("Micro-Grid 24-Hour Simulation Results", fontsize=16, fontweight="bold")
    
    ax1, ax2, ax3 = axes

    # 1. Price vs Time
    ax1.plot(hours, prices, marker="o", color="purple", linewidth=2, label="VWAP Market Price")
    ax1.set_ylabel("Price ($/kWh)")
    ax1.set_title("Clearing Price over 24 Hours")
    ax1.grid(True, linestyle="--", alpha=0.7)
    ax1.legend()
    # Highlight normal bounds
    ax1.axhline(0.12, color="gray", linestyle=":", label="Base Price ($0.12)")

    # 2. Supply vs Demand
    ax2.plot(hours, supplies, marker="s", color="green", linewidth=2, label="Total Supply (Grid Export)")
    ax2.plot(hours, demands, marker="^", color="red", linewidth=2, label="Total Demand (Grid Import)")
    ax2.set_ylabel("Energy (kWh)")
    ax2.set_title("Aggregate Supply vs Demand")
    ax2.grid(True, linestyle="--", alpha=0.7)
    ax2.legend()

    # 3. Trades per Hour (Bar Chart)
    ax3.bar(hours, trade_counts, color="steelblue", alpha=0.8, label="Executed Trades")
    ax3.set_xlabel("Hour of Day")
    ax3.set_ylabel("Number of Trades")
    ax3.set_title("Trade Volume (Matches) per Hour")
    ax3.set_xticks(hours)
    ax3.grid(axis="y", linestyle="--", alpha=0.7)
    ax3.legend()

    plt.tight_layout()
    
    output_file = "simulation_results.png"
    plt.savefig(output_file, dpi=300)
    print(f"\nPlots successfully saved to: {os.path.abspath(output_file)}")
    
    # Attempt to show the plot interactively if running in a GUI environment
    try:
        plt.show()
    except Exception:
        pass

    db.close()


if __name__ == "__main__":
    main()
