Microgrid Energy Trading Platform

A real-time energy trading simulation system that analyzes dynamic market conditions and generates intelligent BUY / SELL / WAIT recommendations using a decision engine.

This project demonstrates full-stack development with real-time data streaming, decision-making logic, and interactive visualization.

Overview

The system simulates a microgrid energy market where households can trade energy based on pricing conditions.

* Backend continuously generates market data and trading decisions
* WebSocket streams real-time updates to the frontend
* Frontend displays insights like recommendations, confidence, and risk levels

Key Features

* Real-time decision engine (BUY / SELL / WAIT)
* WebSocket-based live data streaming
* Confidence score and risk analysis
* Interactive dashboard visualization
* Notification system for decision updates
* Energy trading simulation between households

Tech Stack

Frontend

* React.js
* Recharts (Data Visualization)
* Axios

Backend

* FastAPI (Python)
* WebSockets
* Pydantic (Schema Validation)

Database

* SQLite

System Architecture  

Backend (FastAPI)
    ↓
Market Simulation + Decision Engine
    ↓
WebSocket Stream
    ↓
Frontend (React Dashboard)
