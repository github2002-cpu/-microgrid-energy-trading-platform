"""
FastAPI application entry point.

Creates the app, includes routers, and runs DB initialization on startup.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import random

from app.core.config import settings
from app.db.session import init_db
from app.api.v1 import users, households, simulation, market, forecasts, recommendations, history
import app.models  # noqa: F401 — register ORM models with Base



# ── Lifespan ─────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle hook."""
    # Startup: create tables (safe to call repeatedly with SQLite)
    init_db()
    yield
    # Shutdown: cleanup resources if needed in the future


# ── App factory ──────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-Driven Micro-Grid Energy Trading Platform — Simulation MVP",
    lifespan=lifespan,
)

# ── CORS ────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Register routers ────────────────────────────────────────────
# ── Register routers ────────────────────────────────────────────
app.include_router(users.router, prefix=settings.API_V1_PREFIX)
app.include_router(households.router, prefix=settings.API_V1_PREFIX)
app.include_router(simulation.router, prefix=settings.API_V1_PREFIX)
app.include_router(market.router, prefix=settings.API_V1_PREFIX)
app.include_router(forecasts.router, prefix=settings.API_V1_PREFIX)
app.include_router(recommendations.router, prefix=settings.API_V1_PREFIX)
app.include_router(history.router, prefix=settings.API_V1_PREFIX)


# ── Health check ─────────────────────────────────────────────────
@app.get("/healthz", tags=["System"])
async def health_check():
    """Simple liveness probe."""
    return {"status": "ok", "version": settings.APP_VERSION}


# ── WebSockets ───────────────────────────────────────────────────
@app.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            actions = ["BUY", "SELL", "WAIT"]
            risks = ["LOW", "MEDIUM", "HIGH"]
            
            action = random.choice(actions)
            # Bias towards lower risk to avoid spamming High Risk alerts
            riskLevel = random.choices(risks, weights=[0.6, 0.3, 0.1])[0]
            
            reasons = {
                "BUY": ["Pricing capacity discounts detected.", "Sub-optimal baseline storage levels."],
                "SELL": ["Pricing arbitrage window confirmed.", "Peak demand overhead tracking."],
                "WAIT": ["Market stabilizing. Retaining load.", "Low volatility. No action required."]
            }
            
            message = random.choice(reasons[action])
            if riskLevel == "HIGH":
                message = "Grid volatility has spiked beyond baseline."
                
            payload = {
                "action": action,
                "confidence": random.randint(85, 99),
                "riskLevel": riskLevel,
                "message": message
            }
            
            await websocket.send_json(payload)
            await asyncio.sleep(2.5)
    except WebSocketDisconnect:
        pass
