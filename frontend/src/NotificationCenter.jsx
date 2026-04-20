import React, { useState, useEffect, useCallback, useRef } from 'react';

const styles = {
  container: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    pointerEvents: 'none',
  },
  toast: {
    width: '320px',
    background: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    borderLeft: '4px solid #cbd5e1',
    pointerEvents: 'auto',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    cursor: 'pointer',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  title: {
    fontWeight: '700',
    fontSize: '0.9rem',
    color: '#0f172a',
    letterSpacing: '0.5px'
  },
  time: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    fontWeight: '600',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '20px',
  },
  recLine: {
    fontSize: '0.9rem',
    fontWeight: '800',
  },
  outcomeLine: {
    fontSize: '0.85rem',
    color: '#1e293b',
    fontWeight: '600',
  },
  reasonLine: {
    fontSize: '0.85rem',
    color: '#64748b',
    lineHeight: '1.4'
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: 'auto',
  },
  btn: {
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: '0.8rem',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  btnDismiss: {
    color: '#94a3b8',
  }
};

const getToastConfig = (rec, type) => {
  if (type === 'risk') return { color: '#f59e0b', icon: '⚠', title: 'Risk Alert' };
  if (type === 'opportunity') return { color: '#10b981', icon: '↑', title: 'Opportunity Detected' };
  if (rec === 'BUY') return { color: '#10b981', icon: '↑', title: 'Decision Updated' };
  if (rec === 'SELL') return { color: '#ef4444', icon: '↓', title: 'Decision Updated' };
  if (rec === 'WAIT') return { color: '#64748b', icon: '⏸', title: 'Decision Updated' };
  return { color: '#64748b', icon: '⏸', title: 'Market Update' };
};

function ToastItem({ toast, onDismiss }) {
  const [isClosing, setIsClosing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const timeoutRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const handleDismiss = useCallback(() => {
    clearTimer();
    setIsClosing(true);
    setTimeout(() => onDismiss(toast.id), 300); // Wait for fade out
  }, [clearTimer, onDismiss, toast.id]);

  const startTimer = useCallback(() => {
    clearTimer();
    timeoutRef.current = setTimeout(() => {
      handleDismiss();
    }, 4500);
  }, [clearTimer, handleDismiss]);

  useEffect(() => {
    if (!isHovered) {
      startTimer();
    } else {
      clearTimer();
    }
    return clearTimer;
  }, [isHovered, startTimer, clearTimer]);

  const handleView = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    handleDismiss();
  };

  const config = getToastConfig(toast.recommendation, toast.type);

  // Normalize positive/negative formatting securely
  const formattedProfit = typeof toast.profit === 'string' && !toast.profit.startsWith('-') && !toast.profit.startsWith('+') 
    ? `+${toast.profit}` 
    : toast.profit;

  return (
    <div 
      onClick={handleView}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...styles.toast,
        borderLeftColor: config.color,
        opacity: isClosing ? 0 : 1,
        // Click behavior animation logic handling
        boxShadow: isHovered ? '0 12px 40px rgba(0,0,0,0.12)' : styles.toast.boxShadow,
        transform: isClosing ? 'translateX(20px)' : (isHovered ? 'translateY(-2px)' : 'translateY(0)'),
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        animation: !isClosing ? 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' : 'none'
      }}
    >
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={{ color: config.color, fontWeight: '900', fontSize: '1.1rem' }}>{config.icon}</span>
          <span style={styles.title}>{config.title}</span>
        </div>
        <span style={styles.time}>{toast.timestamp}</span>
      </div>

      <div style={styles.body}>
        <div style={{ ...styles.recLine, color: config.color }}>
          {toast.recommendation} · {toast.confidence}% confidence
        </div>
        {(formattedProfit || toast.outcome) && (
          <div style={styles.outcomeLine}>
            {formattedProfit || toast.outcome} expected {toast.recommendation === 'BUY' ? 'cost' : 'profit'}
          </div>
        )}
        <div style={styles.reasonLine}>
          Reason: {toast.reason}
        </div>
      </div>

      <div style={styles.footer}>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            handleDismiss();
          }} 
          style={{ ...styles.btn, ...styles.btnDismiss }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default function NotificationCenter({ notifications, removeNotification }) {
  return (
    <>
      <style>
        {`
          @keyframes slideIn {
            from { transform: translateX(120%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}
      </style>
      <div style={styles.container}>
        {notifications.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={removeNotification} />
        ))}
      </div>
    </>
  );
}
