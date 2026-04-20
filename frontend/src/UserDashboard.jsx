import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

export default function UserDashboard({ households, history, decisionState, selectedNode, setSelectedNode }) {
  const [actionHistory, setActionHistory] = useState([]);
  
  const [portfolioValue, setPortfolioValue] = useState(250.00);
  const [storedEnergy, setStoredEnergy] = useState(12.5);
  const [profitTracker, setProfitTracker] = useState(0.00);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingAction, setProcessingAction] = useState(null);

  // Safe fallback if the backend fetch delays initially
  const dState = decisionState || {
    action: 'WAIT',
    confidence: 50,
    expectedValue: 0,
    riskLevel: 'LOW',
    reasoning: 'Evaluating live market vectors...',
    predictedTrend: 'Stable',
    predictedChangePct: 0,
    predictedNextPrice: 0.12,
    windowRemaining: 0,
    marketCondition: 'Balanced',
    totalDemand: 0,
    totalSupply: 0,
    currentPrice: 0.12,
    battery_soc_pct: 0
  };

  const handleAction = (actionType) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setProcessingAction(actionType);
    
    setTimeout(() => {
      const price = dState.currentPrice;
      let impact = 0;

      if (actionType === 'BUY') {
        impact = -(5 * price);
        setStoredEnergy(prev => prev + 5);
        setPortfolioValue(prev => prev + impact);
        setProfitTracker(prev => prev + impact);
      } else if (actionType === 'SELL') {
        const amount = Math.min(storedEnergy, 5);
        impact = +(amount * price);
        setStoredEnergy(prev => Math.max(0, prev - amount));
        setPortfolioValue(prev => prev + impact);
        setProfitTracker(prev => prev + impact);
      } else if (actionType === 'STORE') {
        setStoredEnergy(prev => prev + 1);
        impact = 0;
      }

      setActionHistory(prev => [
        { id: Date.now(), time: new Date().toLocaleTimeString(), action: actionType, impact },
        ...prev
      ].slice(0, 8));

      setIsProcessing(false);
      setProcessingAction(null);
    }, 800 + Math.random() * 400); // 800-1200ms delay
  };

  const riskColor = dState.riskLevel === 'HIGH' ? '#ef4444' : dState.riskLevel === 'MEDIUM' ? '#f59e0b' : '#10b981';

  // Dynamic Styling based strictly on unified Decision State
  let themeColor = '#f59e0b'; // WAIT - Yellow
  let themeGlow = 'rgba(245, 158, 11, 0.4)';
  let expectedImpactText = 'No immediate financial change';

  if (dState.action === 'SELL') {
    themeColor = '#ef4444'; // SELL - Red
    themeGlow = 'rgba(239, 68, 68, 0.5)';
    expectedImpactText = `+$${(5 * dState.currentPrice).toFixed(2)} Profit (-5 kWh)`;
  } else if (dState.action === 'BUY') {
    themeColor = '#10b981'; // BUY - Green
    themeGlow = 'rgba(16, 185, 129, 0.5)';
    expectedImpactText = `-$${(5 * dState.currentPrice).toFixed(2)} Cost (+5 kWh)`;
  } else if (dState.action === 'STORE') {
    themeColor = '#3b82f6'; // STORE - Blue
    themeGlow = 'rgba(59, 130, 246, 0.5)';
    expectedImpactText = `Energy conserved for future window`;
  }

  return (
    <div style={{ padding: '2rem 1rem', maxWidth: '1100px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      
      {/* Top Header & Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', color: '#0f172a', margin: 0, fontWeight: '900', letterSpacing: '-0.5px' }}>My Energy Dashboard</h1>
        <select 
          value={selectedNode}
          onChange={(e) => setSelectedNode(e.target.value)}
          style={{ padding: '0.85rem 1.25rem', fontSize: '1.2rem', fontWeight: 'bold', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
        >
          {households.map(h => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>
      </div>

      <style>
        {`
          @keyframes pulseGlow {
            0% { box-shadow: 0 0 20px ${themeGlow}; transform: scale(1); }
            50% { box-shadow: 0 0 50px ${themeGlow}; transform: scale(1.005); }
            100% { box-shadow: 0 0 20px ${themeGlow}; transform: scale(1); }
          }
        `}
      </style>

      {/* 1. Primary Decision Card (Center Focus) */}
      <div id="decision-card" style={{ 
        background: themeColor, color: 'white', borderRadius: '24px', padding: '4rem 2rem', marginBottom: '2rem', 
        textAlign: 'center', animation: 'pulseGlow 3s infinite', border: '4px solid rgba(255,255,255,0.2)', position: 'relative'
      }}>
        
        {dState.riskLevel === 'HIGH' && (
          <div style={{ position: 'absolute', top: '20px', left: '20px', background: '#ef4444', color: 'white', fontWeight: 'bold', padding: '6px 12px', borderRadius: '8px', border: '2px solid white', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' }}>
            ⚠ HIGH RISK WARNING
          </div>
        )}

        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.9, marginBottom: '1rem' }}>
          System Recommendation
        </div>
        <div style={{ fontSize: '7.5rem', fontWeight: '900', lineHeight: '1', margin: '0.5rem 0 1rem 0' }}>
          {dState.action}
        </div>
        
        {/* Confidence Visual Bar & Uncertainty */}
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '16px', maxWidth: '540px', margin: '0 auto 2rem auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 'bold' }}>
            <span>Model Confidence</span>
            <span>{dState.confidence}%</span>
          </div>
          <div style={{ height: '14px', background: 'rgba(255,255,255,0.2)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${dState.confidence}%`, background: dState.confidence > 80 ? '#10b981' : dState.confidence > 50 ? '#fde047' : '#ef4444', transition: 'width 1s ease' }}></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', marginTop: '8px', opacity: 0.9 }}>
            <span>Uncertainty Level: <strong style={{ color: riskColor, background: 'rgba(255,255,255,0.8)', padding: '2px 8px', borderRadius: '4px' }}>{Math.abs(dState.predictedChangePct) > 18 ? 'High' : Math.abs(dState.predictedChangePct) > 8 ? 'Moderate' : 'Low'}</strong></span>
            <span>Trade Risk: <strong style={{ color: riskColor, background: 'rgba(255,255,255,0.8)', padding: '2px 8px', borderRadius: '4px' }}>{dState.riskLevel} Risk</strong></span>
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: '3rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(0,0,0,0.15)', padding: '15px 30px', borderRadius: '16px' }}>
            <div style={{ fontSize: '1.1rem', opacity: 0.9, marginBottom: '5px', textTransform: 'uppercase', fontWeight: 'bold' }}>Expected Outcome</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900' }}>{expectedImpactText}</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.15)', padding: '15px 30px', borderRadius: '16px' }}>
            <div style={{ fontSize: '1.1rem', opacity: 0.9, marginBottom: '5px', textTransform: 'uppercase', fontWeight: 'bold' }}>Urgency</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {dState.action !== 'WAIT' && <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', background: '#fff', animation: 'pulseGlow 1s infinite' }}></span>}
              {dState.action !== 'WAIT' ? `Optimal Window: ${dState.windowRemaining}m` : 'Monitor Safely'}
            </div>
          </div>
        </div>

        {/* Action Buttons entirely embedded in the flow */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '3rem' }}>
          <button disabled={isProcessing} onClick={() => handleAction('SELL')} style={{ opacity: isProcessing ? 0.6 : 1, padding: '1.2rem 3rem', fontSize: '1.5rem', fontWeight: '900', background: '#ffffff', color: '#ef4444', border: 'none', borderRadius: '12px', cursor: isProcessing ? 'not-allowed' : 'pointer', boxShadow: '0 10px 15px rgba(0,0,0,0.2)', transition: 'all 0.2s' }}>
            {processingAction === 'SELL' ? 'Processing Trade...' : 'EXECUTE SELL'}
          </button>
          <button disabled={isProcessing} onClick={() => handleAction('STORE')} style={{ opacity: isProcessing ? 0.6 : 1, padding: '1.2rem 3rem', fontSize: '1.5rem', fontWeight: '900', background: '#ffffff', color: '#8b5cf6', border: 'none', borderRadius: '12px', cursor: isProcessing ? 'not-allowed' : 'pointer', boxShadow: '0 10px 15px rgba(0,0,0,0.2)', transition: 'all 0.2s' }}>
            {processingAction === 'STORE' ? 'Evaluating Grid...' : 'EXECUTE STORE'}
          </button>
          <button disabled={isProcessing} onClick={() => handleAction('BUY')} style={{ opacity: isProcessing ? 0.6 : 1, padding: '1.2rem 3rem', fontSize: '1.5rem', fontWeight: '900', background: '#ffffff', color: '#10b981', border: 'none', borderRadius: '12px', cursor: isProcessing ? 'not-allowed' : 'pointer', boxShadow: '0 10px 15px rgba(0,0,0,0.2)', transition: 'all 0.2s' }}>
            {processingAction === 'BUY' ? 'Processing Trade...' : 'EXECUTE BUY'}
          </button>
        </div>
      </div>

      {/* Live Portfolio Panel */}
      <div style={{ background: '#0f172a', borderRadius: '16px', padding: '2rem', marginBottom: '2rem', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', color: 'white', display: 'flex', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#94a3b8', fontSize: '1.1rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Portfolio Value</div>
          <div style={{ fontSize: '2.5rem', fontWeight: '900', transition: 'color 0.3s ease' }}>${portfolioValue.toFixed(2)}</div>
        </div>
        <div style={{ width: '2px', height: '60px', background: '#334155' }}></div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#94a3b8', fontSize: '1.1rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Net Profit / Loss</div>
          <div style={{ fontSize: '2.5rem', fontWeight: '900', color: profitTracker >= 0 ? '#10b981' : '#ef4444', transition: 'color 0.3s ease' }}>
            {profitTracker >= 0 ? '+' : ''}${profitTracker.toFixed(2)}
          </div>
        </div>
        <div style={{ width: '2px', height: '60px', background: '#334155' }}></div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#94a3b8', fontSize: '1.1rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Stored Energy</div>
          <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#3b82f6', transition: 'color 0.3s ease' }}>{storedEnergy.toFixed(1)} <span style={{fontSize: '1.2rem'}}>kWh</span></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '2rem' }}>
        
        {/* Supporting Panel: Reasoning Breakdown */}
        <div style={{ background: '#ffffff', borderRadius: '16px', padding: '2rem', boxShadow: '0 10px 25px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', margin: '0 0 1.5rem 0', borderBottom: '2px solid #f1f5f9', paddingBottom: '0.75rem' }}>AI Logic Breakdown</h3>
          <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#475569', fontSize: '1.15rem', lineHeight: '1.8' }}>
            <li><strong>Strategy Context:</strong> {dState.reasoning}</li>
            <li><strong>Current Battery:</strong> {dState.battery_soc_pct}% Operational Capacity</li>
            <li><strong>Demand Trend:</strong> {dState.predictedTrend} ({dState.totalDemand.toFixed(1)} kWh load)</li>
            <li><strong>Market Imbalance:</strong> {dState.marketCondition} Grid</li>
            <li><strong>Price Movement:</strong> Predicting {dState.predictedChangePct > 0 ? '+' : ''}{dState.predictedChangePct.toFixed(1)}% shift globally</li>
          </ul>
        </div>

        {/* Supporting Panel: Price Prediction */}
        <div style={{ background: '#ffffff', borderRadius: '16px', padding: '2rem', boxShadow: '0 10px 25px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0', flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.5rem 0' }}>Market Price Trend</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#0f172a', marginBottom: '1rem' }}>
              ${dState.currentPrice.toFixed(3)} <span style={{fontSize:'1.2rem', color:'#64748b', fontWeight:'bold'}}>/ kWh</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.95rem', color: '#64748b', fontWeight: 'bold' }}>Predicted 3h Target</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '900', color: dState.predictedChangePct > 0 ? '#ef4444' : '#10b981' }}>
                {dState.predictedChangePct > 0 ? '↗' : '↘'} ${dState.predictedNextPrice.toFixed(3)} ({dState.predictedChangePct > 0 ? '+' : ''}{dState.predictedChangePct.toFixed(1)}%)
              </div>
            </div>
          </div>
          <div style={{ height: '140px', width: '100%', flex: 1 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[...history].reverse()}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="timeLabel" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                <Line type="monotone" dataKey="clearing_price" stroke="#3b82f6" strokeWidth={4} dot={false} activeDot={{r: 8}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
      
      {/* Action History Timeline */}
      {actionHistory.length > 0 && (
        <div style={{ background: '#ffffff', borderRadius: '16px', padding: '2rem', boxShadow: '0 10px 25px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0', marginTop: '2rem' }}>
          <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', margin: '0 0 1.5rem 0', borderBottom: '2px solid #f1f5f9', paddingBottom: '0.75rem' }}>Personal Action Sequence</h3>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem' }}>
            {actionHistory.slice().reverse().map((act, i) => (
              <React.Fragment key={act.id}>
                {i > 0 && <div style={{ color: '#cbd5e1', fontWeight: '900', fontSize: '1.5rem' }}>→</div>}
                <div style={{ 
                  background: act.action === 'SELL' ? '#fee2e2' : act.action === 'BUY' ? '#d1fae5' : '#ede9fe',
                  border: `2px solid ${act.action === 'SELL' ? '#ef4444' : act.action === 'BUY' ? '#10b981' : '#8b5cf6'}`,
                  borderRadius: '12px', padding: '1rem 1.5rem', textAlign: 'center', minWidth: '120px'
                }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: '900', color: act.action === 'SELL' ? '#ef4444' : act.action === 'BUY' ? '#10b981' : '#8b5cf6' }}>{act.action}</div>
                  {act.impact !== 0 && (
                    <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: act.impact > 0 ? '#10b981' : '#ef4444', marginTop: '4px' }}>
                      {act.impact > 0 ? '+' : ''}{act.impact.toFixed(3)}
                    </div>
                  )}
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>{act.time}</div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
