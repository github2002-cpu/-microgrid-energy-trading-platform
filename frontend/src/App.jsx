import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import House3DView from './House3DView';
import ScenarioSimulator from './ScenarioSimulator';
import UserDashboard from './UserDashboard';
import NotificationCenter from './NotificationCenter';
import './index.css';

const API_BASE = 'http://127.0.0.1:8000/api/v1';

function App() {
  const [viewMode, setViewMode] = useState('admin'); // 'admin' | 'user'
  const [marketState, setMarketState] = useState(null);
  const [households, setHouseholds] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [history, setHistory] = useState([]); // Array of raw history dicts
  const [transactions, setTransactions] = useState([]);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [tickRate, setTickRate] = useState(1.0);
  const [historySortOrder, setHistorySortOrder] = useState('desc'); // 'desc' = latest first

  // Single Source of Truth
  const [selectedNode, setSelectedNode] = useState('');
  const [decisionState, setDecisionState] = useState({
    action: 'WAIT',
    confidence: 50,
    expectedValue: 0,
    riskLevel: 'LOW',
    reasoning: 'Analyzing live market conditions...',
    timestamp: Date.now(),
    predictedTrend: 'Stable',
    predictedChangePct: 0,
    predictedNextPrice: 0.12,
    windowRemaining: 52,
    marketCondition: 'Balanced',
    totalDemand: 1,
    totalSupply: 1,
    currentPrice: 0.12,
    battery_soc_pct: 0
  });
  const [wsDecision, setWsDecision] = useState(null);
  const [wsConnected, setWsConnected] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const lastDecisionRef = useRef(null);
  const lastNotifTimeRef = useRef(0);      // timestamp of last notification (for cooldown)
  const highConfActiveRef = useRef(false); // hysteresis: true once confidence crossed ≥90, reset at <85

  const [forecast, setForecast] = useState(null);
  const [fullHistory, setFullHistory] = useState([]);
  const [historyHours, setHistoryHours] = useState(24);
  const [selectedHoverId, setSelectedHoverId] = useState('ALL');

  // Unified WebSocket Connection
  useEffect(() => {
    let ws;
    let reconnectTimeout;

    const connectWS = () => {
      try {
        ws = new WebSocket('ws://localhost:8000/ws/alerts');

        ws.onopen = () => {
          console.log('[App] WebSocket Connected');
          setWsConnected(true);
        };

        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            console.log('[App] WS Payload parsed securely:', data);
            setWsDecision(data);
          } catch (err) {
            console.error('[App] Failed to parse WS message JSON:', err);
          }
        };

        ws.onclose = () => {
          console.log('[App] WebSocket Disconnected. Native backoff reconnecting in 4s...');
          setWsConnected(false);
          reconnectTimeout = setTimeout(connectWS, 4000);
        };

        ws.onerror = (err) => {
          console.error('[App] WebSocket Structural Error:', err);
          if (ws) ws.close();
        };
      } catch (fatalErr) {
        console.error('[App] Fatal Error initializing WebSocket instance:', fatalErr);
      }
    };

    connectWS();

    return () => {
      console.log('[App] Cleaning up WebSocket closures.');
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const fetchData = async () => {
    try {
      const [stateRes, histRes, txRes, foreRes, recRes, fullHistRes, hhRes] = await Promise.all([
        axios.get(`${API_BASE}/market/state`),
        axios.get(`${API_BASE}/market/history?limit=24`),
        axios.get(`${API_BASE}/market/transactions?limit=20`),
        axios.get(`${API_BASE}/forecast/?horizon=6`),
        axios.get(`${API_BASE}/recommendations`),
        axios.get(`${API_BASE}/history?hours=${historyHours}`),
        axios.get(`${API_BASE}/households`)
      ]);

      if (stateRes.data.current_price_per_kwh !== undefined) {
        setMarketState(stateRes.data);
      }
      setHistory(histRes.data);
      setTransactions(txRes.data);
      setForecast(foreRes.data);
      setRecommendations(recRes.data);
      setFullHistory(fullHistRes.data.reverse()); // newest first for table
      setHouseholds(hhRes.data);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  };

  useEffect(() => {
    fetchData(); // initial fetch
    const interval = setInterval(fetchData, 3000); // refresh every 3s
    return () => clearInterval(interval);
  }, [historyHours]); // re-fetch if history filter changes

  // Auto-play simulation hook
  useEffect(() => {
    let interval;
    if (isAutoPlaying) {
      interval = setInterval(async () => {
        try {
          await axios.post(`${API_BASE}/simulation/run?hours=1`);
          fetchData();
        } catch (e) { console.error(e); setIsAutoPlaying(false); }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  // ── ALL HOOKS MUST COME BEFORE ANY RETURN ─────────────────────

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const addNotification = useCallback((event) => {
    const now = Date.now();
    const newToast = {
      ...event,
      id: now + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setNotifications(prev => [newToast, ...prev].slice(0, 5));
  }, []);

  // Guarantee Node Selector initializes correctly
  useEffect(() => {
    if (households.length > 0 && !selectedNode) {
      setSelectedNode(households[0].id);
    }
  }, [households, selectedNode]);

  // Unified Data Flow deriving ALL UI state from market backend hook + WS decision
  useEffect(() => {
    // We want to construct decisionState ALWAYS, even if marketState is missing.
    const currentPrice = marketState?.current_price_per_kwh || 0.12;
    const totalDemand = marketState?.total_demand_kwh || 1;
    const totalSupply = marketState?.total_supply_kwh || 1;
    const imbalanceRatio = totalDemand / totalSupply;

    let predictedChangePct = 0;
    let predictedTrend = 'Stable';
    if (imbalanceRatio > 1.2) {
      predictedTrend = 'Increasing';
      predictedChangePct = Math.min((imbalanceRatio - 1) * 20, 30);
    } else if (imbalanceRatio < 0.8) {
      predictedTrend = 'Decreasing';
      predictedChangePct = Math.max((imbalanceRatio - 1) * 20, -30);
    } else {
      predictedChangePct = (Math.random() * 2 - 1);
    }

    let marketCondition = 'Balanced';
    if (totalDemand > totalSupply * 1.5) marketCondition = 'High Demand';
    else if (totalSupply > totalDemand * 1.5) marketCondition = 'High Supply';

    // Base core decision strictly on WebSocket data if available
    const baseAction = wsDecision?.action || (recommendations.length > 0 ? (recommendations[0].action || 'WAIT') : 'WAIT');
    const baseConf = wsDecision?.confidence || 50;
    const baseRisk = wsDecision?.riskLevel || (Math.abs(predictedChangePct) > 18 ? 'HIGH' : 'LOW');
    const baseReason = wsDecision?.message || 'Analyzing live market conditions...';

    const expectedValue = baseAction === 'BUY' ? -(5 * currentPrice) : baseAction === 'SELL' ? +(5 * currentPrice) : 0;

    const newState = {
      action: baseAction,
      confidence: baseConf,
      expectedValue,
      riskLevel: baseRisk,
      reasoning: baseReason,
      timestamp: Date.now(),
      predictedTrend,
      predictedChangePct,
      predictedNextPrice: currentPrice * (1 + (predictedChangePct / 100)),
      windowRemaining: baseRisk === 'HIGH' ? 12 : 52,
      marketCondition,
      totalDemand,
      totalSupply,
      currentPrice,
      battery_soc_pct: households?.find(h => h.id === selectedNode)?.battery_soc_pct || 0
    };

    setDecisionState(newState);

    // ── Notification gate: only fire on MEANINGFUL changes ─────────
    const prev = lastDecisionRef.current;
    const now = Date.now();
    const cooldownMs = 10_000; // 10-second minimum between notifications
    const riskRank = { LOW: 0, MEDIUM: 1, HIGH: 2 };

    // Hysteresis: track high-confidence zone entry/exit
    if (newState.confidence >= 90)  highConfActiveRef.current = true;
    if (newState.confidence < 85)   highConfActiveRef.current = false; // reset below lower bound
    const confidenceCrossed = prev && !prev.__highConfActive && highConfActiveRef.current;

    const actionChanged   = prev && prev.action !== newState.action;
    const riskIncreased   = prev && riskRank[newState.riskLevel] > riskRank[prev.riskLevel];
    const isFirstDecision = !prev;
    const onCooldown      = (now - lastNotifTimeRef.current) < cooldownMs;

    const shouldNotify = !isFirstDecision && !onCooldown &&
      (actionChanged || riskIncreased || confidenceCrossed);

    if (isFirstDecision || shouldNotify) {
      if (shouldNotify) {
        const type = newState.riskLevel === 'HIGH' ? 'risk' : 'decision_change';
        addNotification({
          type,
          recommendation: newState.action,
          confidence: newState.confidence,
          profit: newState.expectedValue !== 0 ? `${newState.expectedValue > 0 ? '+' : ''}$${Math.abs(newState.expectedValue).toFixed(2)}` : null,
          reason: newState.reasoning,
          risk: newState.riskLevel
        });
        lastNotifTimeRef.current = now;
      }
      // Snapshot high-confidence state so next cycle can detect re-entry
      lastDecisionRef.current = { ...newState, __highConfActive: highConfActiveRef.current };
    }

  }, [marketState, households, selectedNode, wsDecision, recommendations, addNotification]);

  // ── ALL HOOKS DECLARED — SAFE TO RETURN CONDITIONALLY NOW ─────

  // Format times helper (plain function, not a hook)
  const formatTime = (isoString) => {
    const d = new Date(isoString);
    return isNaN(d) ? '??' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formattedHistory = history.map(h => ({ ...h, timeLabel: formatTime(h.timestamp) }));
  const formattedFullHistory = [...fullHistory].reverse().map(h => ({ ...h, timeLabel: formatTime(h.timestamp) }));
  const sortedTableData = [...fullHistory].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return historySortOrder === 'desc' ? timeB - timeA : timeA - timeB;
  });

  console.log('[App] Rendering — decisionState:', decisionState, '| marketState:', marketState);

  // ── ALL GUARDS ────────────────────────────────────────
  // User dashboard renders immediately with defaults — never block it.
  // Admin dashboard needs real data to show KPI cards (safe to guard).

  if (viewMode === 'user') {
    return (
      <div style={{ background: '#f1f5f9', minHeight: '100vh', position: 'relative' }}>
        {/* DEBUG BAR — remove once confirmed working */}
        <pre style={{ position: 'fixed', top: 0, left: 0, zIndex: 99999, background: 'rgba(0,0,0,0.85)', color: '#0f0', fontSize: '9px', padding: '6px 10px', margin: 0, maxWidth: '320px', pointerEvents: 'none', whiteSpace: 'pre-wrap' }}>
          action={decisionState?.action} conf={decisionState?.confidence} ws={wsDecision?.action ?? 'none'}
        </pre>

        <NotificationCenter notifications={notifications} removeNotification={removeNotification} />
        <header style={{ padding: '1rem 2rem', background: '#0f172a', display: 'flex', justifyContent: 'flex-end', borderBottom: '4px solid #3b82f6' }}>
          <button
            onClick={() => setViewMode('admin')}
            style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>
            Switch to Admin Simulator Mode
          </button>
        </header>
        <UserDashboard
          households={households}
          history={formattedFullHistory}
          decisionState={decisionState}
          selectedNode={selectedNode}
          setSelectedNode={setSelectedNode}
        />
      </div>
    );
  }

  // Fallback for Admin view if basic requirements missing
  if (!marketState || !households || households.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#0f172a', color: 'white', fontFamily: 'sans-serif' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', fontWeight: '900' }}>Initializing Admin Simulator...</h1>
        <p style={{ color: '#94a3b8', fontSize: '1.2rem' }}>Fetching full structural array metrics from REST API...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container" style={{ position: 'relative' }}>

      {/* DEBUG BAR — remove once confirmed working */}
      <pre style={{ position: 'fixed', top: 0, left: 0, zIndex: 99999, background: 'rgba(0,0,0,0.85)', color: '#0f0', fontSize: '9px', padding: '6px 10px', margin: 0, maxWidth: '320px', pointerEvents: 'none', whiteSpace: 'pre-wrap' }}>
        action={decisionState?.action} conf={decisionState?.confidence} ws={wsDecision?.action ?? 'none'}
      </pre>

      <NotificationCenter notifications={notifications} removeNotification={removeNotification} />
      <header className="header">
        <h1>Micro-Grid Trading Platform</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setViewMode('user')}
            style={{ padding: '8px 16px', background: 'transparent', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            Switch to End-User App
          </button>
          <button
            style={{ padding: '8px 16px', background: isAutoPlaying ? 'var(--accent-red)' : 'var(--accent-blue)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
          >
            {isAutoPlaying ? "⏸ Pause Auto-Play" : "▶️ Auto-Play Step-by-Step"}
          </button>
          <button
            style={{ padding: '8px 16px', background: 'var(--accent-green)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            onClick={async () => { await axios.post(`${API_BASE}/simulation/run?hours=1`); fetchData(); }}
            disabled={isAutoPlaying}
          >
            + Simulate Next Hour
          </button>
        </div>
      </header>

      {/* Top KPIs */}
      <section className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-title">Current Clearing Price</div>
          <div className="kpi-value purple">${marketState.current_price_per_kwh.toFixed(3)}<span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/kWh</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Total Grid Supply</div>
          <div className="kpi-value green">{marketState.total_supply_kwh.toFixed(1)} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>kWh</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Total Grid Demand</div>
          <div className="kpi-value red">{marketState.total_demand_kwh.toFixed(1)} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>kWh</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Price Range (Bounds)</div>
          <div className="kpi-value" style={{ fontSize: '1.5rem', marginTop: '10px' }}>
            ${marketState.min_price.toFixed(3)} - ${marketState.max_price.toFixed(3)}
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <section className="main-grid">
        <div className="left-column" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Price History Chart */}
          <div className="panel">
            <h2>Market Price History</h2>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={formattedHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="timeLabel" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" tickFormatter={(val) => `$${val.toFixed(2)}`} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                    itemStyle={{ color: '#8b5cf6' }}
                    formatter={(val) => [`$${parseFloat(val).toFixed(3)}`, 'Price']}
                  />
                  <Line type="monotone" dataKey="price" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: '#8b5cf6' }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Supply vs Demand Chart */}
          <div className="panel">
            <h2>Supply vs Demand</h2>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={formattedHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="timeLabel" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="supply" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.5} name="Supply (kWh)" />
                  <Area type="monotone" dataKey="demand" stackId="2" stroke="#ef4444" fill="#ef4444" fillOpacity={0.5} name="Demand (kWh)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Forecast Strip */}
          <div className="panel" style={{ paddingBottom: '1rem' }}>
            <h2>AI Demand Forecast (Next 6h) &nbsp;&nbsp; <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Next Hr Price Pred: ${forecast?.next_hour_price_prediction.toFixed(3)}</span></h2>
            <div className="forecast-list">
              {forecast?.demand_trend.map((f, idx) => (
                <div key={idx} className="forecast-item">
                  <div className="forecast-time">+{f.offset_hours} h ({formatTime(f.target_time)})</div>
                  <div className="forecast-val">{f.predicted_demand_kwh.toFixed(1)} kWh</div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '4px' }}>{f.model === '24h_seasonal_lag' ? 'Historical' : 'Flat'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Recommendations Panel */}
          <div className="panel">
            <h2>Live Household Recommendations</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {recommendations.map(r => {
                let badgeColor = '#64748b'; // default WAIT
                if (r.action === 'BUY') badgeColor = '#3b82f6';
                if (r.action === 'SELL') badgeColor = '#10b981';
                if (r.action === 'STORE') badgeColor = '#8b5cf6';

                return (
                  <div key={r.household_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                    <div style={{ flex: 1, paddingRight: '2rem' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '4px' }}>{r.household_name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{r.reason}</div>
                      <ul style={{ margin: '8px 0', paddingLeft: '20px', fontSize: '0.85rem', color: '#cbd5e1' }}>
                        {r.rules && r.rules.map((rule, idx) => (
                          <li key={idx} style={{ marginBottom: '2px' }}>{rule}</li>
                        ))}
                      </ul>
                      <div style={{ fontSize: '0.8rem', marginTop: '8px', color: '#94a3b8' }}>
                        Batt: {r.battery_soc_pct}% | Mkt: ${r.current_price.toFixed(3)} | Pred: ${r.predicted_price.toFixed(3)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                      <span style={{
                        background: badgeColor, color: 'white', padding: '6px 16px', borderRadius: '20px',
                        fontWeight: 'bold', fontSize: '0.9rem', letterSpacing: '0.05em'
                      }}>
                        {r.action}
                      </span>
                      {r.confidence !== undefined && (
                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: r.confidence >= 80 ? '#10b981' : '#fbbf24' }}>
                          {r.confidence}% Match
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right Column */}
        <div className="right-column">
          <div className="panel" style={{ height: '100%' }}>
            <h2>Recent Transactions</h2>
            {transactions.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No matches in recent history.</p>
            ) : (
              <ul className="tx-list">
                {transactions.map(tx => (
                  <li key={tx.id} className="tx-item">
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="tx-qty">{tx.quantity_kwh.toFixed(2)} kWh Match</span>
                      <span className="tx-time">{formatTime(tx.executed_at)}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className="tx-price">${tx.price_per_kwh.toFixed(3)}</span>
                      <div className="tx-time">Value: ${tx.total_value.toFixed(2)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Historical Data Table Section */}
      <section className="panel" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          <h2 style={{ borderBottom: 'none', margin: 0, padding: 0 }}>Historical Data Explorer</h2>
          <div style={{ display: 'flex', gap: '15px' }}>
            <div>
              <span style={{ marginRight: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Sort:</span>
              <select
                value={historySortOrder}
                onChange={e => setHistorySortOrder(e.target.value)}
                style={{ padding: '4px 8px', background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
              >
                <option value="desc">Latest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>
            <div>
              <span style={{ marginRight: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Timeframe:</span>
              <select
                value={historyHours}
                onChange={e => setHistoryHours(Number(e.target.value))}
                style={{ padding: '4px 8px', background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
              >
                <option value={6}>Last 6 Hours</option>
                <option value={12}>Last 12 Hours</option>
                <option value={24}>Last 24 Hours</option>
                <option value={48}>Last 48 Hours</option>
              </select>
            </div>
          </div>
        </div>

        {/* Dedicated History Combo Chart */}
        <div className="chart-container" style={{ height: '320px', marginBottom: '1.5rem', background: 'var(--bg-color)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          {formattedFullHistory.length === 0 ? (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              No data available. Please run the simulation to generate historical data.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={formattedFullHistory} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="timeLabel" stroke="#94a3b8" />
                <YAxis yAxisId="left" stroke="#8b5cf6" tickFormatter={(val) => `$${val.toFixed(2)}`} />
                <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                  itemStyle={{ color: '#f8fafc' }}
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="clearing_price" name="Price ($/kWh)" stroke="#8b5cf6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                <Line yAxisId="right" type="stepAfter" dataKey="supply" name="Supply (kWh)" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                <Line yAxisId="right" type="stepAfter" dataKey="demand" name="Demand (kWh)" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--panel-bg)', zIndex: 1, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <tr>
                <th style={{ padding: '10px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>Timestamp</th>
                <th style={{ padding: '10px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>Clearing Price</th>
                <th style={{ padding: '10px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>Supply (kWh)</th>
                <th style={{ padding: '10px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>Demand (kWh)</th>
                <th style={{ padding: '10px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>Total Trades</th>
              </tr>
            </thead>
            <tbody>
              {sortedTableData.map((row, idx) => {
                const isLatest = row.timestamp === marketState?.timestamp;
                return (
                  <tr key={idx} style={{
                    borderBottom: '1px solid var(--border-color)',
                    backgroundColor: isLatest ? 'rgba(59, 130, 246, 0.15)' : (idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'),
                    transition: 'background-color 0.3s ease'
                  }}>
                    <td style={{ padding: '10px' }}>
                      {new Date(row.timestamp).toLocaleString()}
                      {isLatest && <span style={{ marginLeft: '8px', fontSize: '0.75rem', background: 'var(--accent-blue)', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>LATEST</span>}
                    </td>
                    <td style={{ padding: '10px', color: 'var(--accent-purple)', fontWeight: 'bold' }}>${row.clearing_price ? row.clearing_price.toFixed(3) : '---'}</td>
                    <td style={{ padding: '10px', color: 'var(--accent-green)' }}>{row.supply.toFixed(2)}</td>
                    <td style={{ padding: '10px', color: 'var(--accent-red)' }}>{row.demand.toFixed(2)}</td>
                    <td style={{ padding: '10px' }}>{row.trades ? row.trades.length : 0} match(es)</td>
                  </tr>
                );
              })}
              {sortedTableData.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No historical data available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3D Household Insights Section */}
      <section className="panel" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          <h2 style={{ borderBottom: 'none', margin: 0, padding: 0 }}>3D Interactive Insights</h2>
          <div>
            <span style={{ marginRight: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Focus Node:</span>
            <select
              value={selectedHoverId}
              onChange={e => setSelectedHoverId(e.target.value)}
              style={{ padding: '4px 8px', background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
            >
              <option value="ALL">Entire Market (No Filter)</option>
              {households.map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Live Scenario Simulator Control Panel */}
        <ScenarioSimulator onScenarioUpdated={fetchData} />

        <div style={{ position: 'relative', width: '100%', cursor: 'grab' }}>
          {/* Note: Timeframe inherited from the historical table state (historyHours) */}
          <House3DView historyData={fullHistory} selectedHouseholdId={selectedHoverId} />
        </div>
      </section>

    </div>
  );
}

export default App;
