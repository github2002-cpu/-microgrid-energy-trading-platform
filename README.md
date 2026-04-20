# Microgrid Energy Trading Platform

A real-time energy trading simulation system that analyzes market conditions and generates intelligent BUY / SELL / WAIT recommendations using a decision engine.

This project demonstrates full-stack development with real-time data streaming, decision-making logic, and interactive visualization.



## Overview

The system simulates a microgrid energy market where households can trade energy based on pricing conditions.

- Backend continuously generates market data and trading decisions  
- WebSocket streams real-time updates to the frontend  
- Frontend displays insights like recommendations, confidence, and risk levels  


## Key Features

- Real-time decision engine (BUY / SELL / WAIT)
- WebSocket-based live data streaming
- Confidence score and risk analysis
- Interactive dashboard visualization
- Notification system for decision updates
- Energy trading simulation between households


## Tech Stack

### Frontend
- React.js
- Recharts
- Axios

### Backend
- FastAPI (Python)
- WebSockets
- Pydantic

### Database
- SQLite


## System Architecture

Backend (FastAPI)
→ Market Simulation + Decision Engine
→ WebSocket Stream
→ Frontend (React Dashboard)


## Project Structure

app/
├── api/
├── core/
├── models/
├── schemas/
├── services/
└── main.py

frontend/
├── src/
├── public/
└── vite.config.js

scripts/
└── simulation / utilities

requirements.txt
microgrid.db



## How It Works

1. Backend generates simulated energy market data
2. Decision engine analyzes:
   - Market price trends
   - Energy availability
   - Risk conditions
3. System produces recommendation:
   - BUY → purchase energy
   - SELL → sell energy
   - WAIT → hold position
4. Frontend displays:
   - Recommendation
   - Confidence level
   - Risk level
   - Expected outcome



## Getting Started

### 1. Clone Repository

git clone https://github.com/your-username/microgrid-energy-trading-platform.git
cd microgrid-energy-trading-platform



### 2. Backend Setup

cd app  
pip install -r ../requirements.txt  
uvicorn main:app --reload  

Backend runs at:
http://127.0.0.1:8000



### 3. Frontend Setup

cd frontend  
npm install  
npm run dev  

Frontend runs at:
http://localhost:5173



## Screenshots

(Add your dashboard screenshots here)



## Example Output

- Action: SELL  
- Confidence: 96%  
- Risk Level: LOW  
- Expected Profit: +$0.61  



## Challenges Solved

- Real-time synchronization using WebSockets  
- React hook state management issues  
- Decision consistency across updates  
- Preventing notification spam  
- Handling asynchronous data flow  



## Future Improvements

- Machine Learning-based prediction model  
- Cloud deployment (AWS / Render / Vercel)  
- Authentication system  
- Multi-user simulation  
- Advanced trading strategies  



## Author

-Mehul Batham 

-Yathartha Jain

Engineering Students (Information Technology)


## License

This project is open-source and available for learning and experimentation.
