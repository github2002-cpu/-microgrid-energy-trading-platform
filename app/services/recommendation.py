"""
Recommendation engine service.
Analyzes market conditions and household state to recommend discrete actions.
"""
from sqlalchemy.orm import Session
from app.models.household import Household
from app.models.market_state import MarketState
from app.services.forecast import predict_next_price

def get_all_recommendations(db: Session) -> list[dict]:
    """Generate recommendations for all households."""
    households = db.query(Household).all()
    latest_state = db.query(MarketState).order_by(MarketState.timestamp.desc()).first()
    
    current_price = latest_state.current_price_per_kwh if latest_state else 0.12
    predicted_price = predict_next_price(db, window_hours=3)
    
    recommendations = []
    
    for hh in households:
        batt_soc = hh.battery_soc_pct
        
        confidence = 0.0
        rules = []
        
        # Recommendation Logic
        # 1. Price is rising significantly
        if predicted_price > current_price * 1.05:
            rules.append(f"Upward price trend: Predicted ${predicted_price:.3f} vs Current ${current_price:.3f}")
            if batt_soc < 80:
                action = "BUY"
                reason = "Price expected to rise and battery has capacity."
                rules.append(f"Battery has capacity (current: {batt_soc:.1f}%)")
                confidence = 0.70 + (0.30 * ((100 - batt_soc) / 100))
            else:
                action = "STORE"
                reason = "Price expected to rise, but battery is nearly full. Hold energy for later."
                rules.append(f"Battery is near capacity (current: {batt_soc:.1f}%)")
                confidence = 0.85
                
        # 2. Price is falling significantly
        elif predicted_price < current_price * 0.95:
            rules.append(f"Downward price trend: Predicted ${predicted_price:.3f} vs Current ${current_price:.3f}")
            if batt_soc > 20:
                action = "SELL"
                reason = f"Price expected to fall to ${predicted_price:.3f}. Sell now while price is higher."
                rules.append(f"Battery has sufficient reserve (current: {batt_soc:.1f}%)")
                confidence = 0.70 + (0.30 * (batt_soc / 100))
            else:
                action = "WAIT"
                reason = "Price expected to fall, but battery is too low to sell."
                rules.append(f"Battery is too low to discharge safely (current: {batt_soc:.1f}%)")
                confidence = 0.90
                
        # 3. Price is relatively stable
        else:
            rules.append(f"Stable pricing: Predicted ${predicted_price:.3f} vs Current ${current_price:.3f}")
            if batt_soc > 90:
                action = "SELL"
                reason = "Battery is full. Sell excess energy to the grid."
                rules.append("Battery is fully charged (>90%)")
                confidence = 0.95
            elif batt_soc < 15:
                action = "BUY"
                reason = "Battery is critically low. Buy to maintain reserves."
                rules.append("Critical battery state (<15%) requires urgent charge")
                confidence = 0.95
            else:
                action = "STORE"
                reason = "Prices are stable and battery is optimal. Conserve energy."
                rules.append(f"Optimal battery state buffer (current: {batt_soc:.1f}%)")
                confidence = 0.60
                
        recommendations.append({
            "household_id": hh.id,
            "household_name": hh.name,
            "action": action,
            "reason": reason,
            "confidence": round(confidence * 100, 1),
            "rules": rules,
            "current_price": round(current_price, 3),
            "predicted_price": round(predicted_price, 3),
            "battery_soc_pct": round(batt_soc, 1)
        })
        
    return recommendations
