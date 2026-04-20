import React, { useState } from 'react';
import axios from 'axios';

const API_BASE = 'http://127.0.0.1:8000/api/v1';

export default function ScenarioSimulator({ onScenarioUpdated }) {
  const [battery, setBattery] = useState(50);
  const [demand, setDemand] = useState(1.0);
  const [supply, setSupply] = useState(1.0);
  const [volatility, setVolatility] = useState(1.0);
  
  const [batteryEnabled, setBatteryEnabled] = useState(false);

  const applyConfig = async (configOverride = {}) => {
    const config = {
      battery_level: configOverride.batteryEnabled !== undefined ? (configOverride.batteryEnabled ? (configOverride.battery ?? battery) : null) : (batteryEnabled ? battery : null),
      demand_multiplier: configOverride.demand ?? demand,
      supply_multiplier: configOverride.supply ?? supply,
      price_volatility: configOverride.volatility ?? volatility
    };

    try {
      await axios.post(`${API_BASE}/simulation/config`, config);
      await axios.post(`${API_BASE}/simulation/run?hours=1`);
      if (onScenarioUpdated) onScenarioUpdated();
    } catch (err) {
      console.error("Scenario override failed", err);
    }
  };

  return (
    <section className="panel" style={{ marginTop: '2rem', marginBottom: '1rem', background: '#f8fafc', border: '1px solid #cbd5e1' }}>
      <h2 style={{ color: '#0f172a', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginTop: 0 }}>
        ⚡ Live Scenario Simulator
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
        
        {/* Battery */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label style={{ color: '#334155', fontWeight: 'bold', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={batteryEnabled} onChange={(e) => {
                const checked = e.target.checked;
                setBatteryEnabled(checked);
                applyConfig({ batteryEnabled: checked });
              }} style={{ marginRight: '8px' }} />
              Override Battery
            </label>
            <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{batteryEnabled ? `${battery}%` : 'Auto'}</span>
          </div>
          <input 
            type="range" min="0" max="100" step="1" 
            value={battery} 
            disabled={!batteryEnabled}
            onChange={e => setBattery(Number(e.target.value))}
            onMouseUp={() => applyConfig()}
            onTouchEnd={() => applyConfig()}
            style={{ width: '100%', cursor: batteryEnabled ? 'pointer' : 'not-allowed' }}
          />
        </div>

        {/* Demand */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label style={{ color: '#334155', fontWeight: 'bold', fontSize: '0.85rem' }}>Demand Multiplier</label>
            <span style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 'bold' }}>{demand.toFixed(1)}x</span>
          </div>
          <input 
            type="range" min="0.1" max="3.0" step="0.1" 
            value={demand} 
            onChange={e => setDemand(Number(e.target.value))}
            onMouseUp={() => applyConfig()}
            onTouchEnd={() => applyConfig()}
            style={{ width: '100%', cursor: 'pointer' }}
          />
        </div>

        {/* Supply */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label style={{ color: '#334155', fontWeight: 'bold', fontSize: '0.85rem' }}>Supply Multiplier</label>
            <span style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 'bold' }}>{supply.toFixed(1)}x</span>
          </div>
          <input 
            type="range" min="0.1" max="3.0" step="0.1" 
            value={supply} 
            onChange={e => setSupply(Number(e.target.value))}
            onMouseUp={() => applyConfig()}
            onTouchEnd={() => applyConfig()}
            style={{ width: '100%', cursor: 'pointer' }}
          />
        </div>

        {/* Volatility */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label style={{ color: '#334155', fontWeight: 'bold', fontSize: '0.85rem' }}>Price Volatility</label>
            <span style={{ color: '#8b5cf6', fontSize: '0.85rem', fontWeight: 'bold' }}>{volatility.toFixed(1)}x</span>
          </div>
          <input 
            type="range" min="0.0" max="5.0" step="0.1" 
            value={volatility} 
            onChange={e => setVolatility(Number(e.target.value))}
            onMouseUp={() => applyConfig()}
            onTouchEnd={() => applyConfig()}
            style={{ width: '100%', cursor: 'pointer' }}
          />
        </div>

      </div>
    </section>
  );
}
