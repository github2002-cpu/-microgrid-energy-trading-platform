"""
ORM model registry.

Import all models here so that Base.metadata is aware of them
when init_db() calls create_all().
"""

from app.models.user import User  # noqa: F401
from app.models.household import Household  # noqa: F401
from app.models.energy_log import EnergyLog  # noqa: F401
from app.models.market_state import MarketState  # noqa: F401
from app.models.order import Order  # noqa: F401
from app.models.transaction import Transaction  # noqa: F401
