/**
 * Starling Bank — injected CSS styles.
 *
 * Design language: clean dark navy (like weight-tracker) with
 * Sero emerald-green accent + indigo secondary.
 */

export const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,300;1,9..40,400&family=DM+Mono:wght@300;400;500&display=swap');

  .sb-root {
    --sb-bg: #0f1117;
    --sb-surface: #191b23;
    --sb-elevated: #22252f;
    --sb-text: #e8e4df;
    --sb-muted: #8b8d97;
    --sb-dim: #5c5e6a;
    --sb-accent: #34d399;
    --sb-accent-hover: #6ee7b7;
    --sb-accent-glow: rgba(52, 211, 153, 0.12);
    --sb-accent-dim: #059669;
    --sb-secondary: #818cf8;
    --sb-secondary-glow: rgba(129, 140, 248, 0.12);
    --sb-danger: #f87171;
    --sb-warning: #fbbf24;
    --sb-border: rgba(255, 255, 255, 0.07);
    --sb-border-accent: rgba(52, 211, 153, 0.2);

    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    color: var(--sb-text);
    min-height: 100%;
  }

  @supports (color: var(--bg-base)) {
    .sb-root {
      --sb-bg: var(--bg-base, #0f1117);
      --sb-surface: var(--bg-surface, #191b23);
      --sb-elevated: var(--bg-elevated, #22252f);
      --sb-text: var(--text-primary, #e8e4df);
      --sb-border: var(--border, rgba(255, 255, 255, 0.07));
    }
  }

  .sb-root * { box-sizing: border-box; }

  .sb-card {
    background: var(--sb-surface);
    border: 1px solid var(--sb-border);
    border-radius: 12px;
    position: relative;
    overflow: hidden;
  }

  .sb-card-embossed {
    background: var(--sb-surface);
    border: 1px solid var(--sb-border);
    border-radius: 14px;
    padding: 20px;
  }

  .sb-input {
    background: var(--sb-elevated);
    border: 1px solid var(--sb-border);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 14px;
    color: var(--sb-text);
    font-family: 'DM Mono', 'DM Sans', monospace;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    width: 100%;
    letter-spacing: 0.5px;
  }
  .sb-input::placeholder { color: var(--sb-dim); }
  .sb-input:focus {
    border-color: var(--sb-accent);
    box-shadow: 0 0 0 2px var(--sb-accent-glow);
  }

  .sb-btn {
    background: var(--sb-accent);
    color: #0f1117;
    border: none;
    border-radius: 8px;
    padding: 10px 24px;
    font-size: 14px;
    font-weight: 600;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    transition: all 0.15s;
    letter-spacing: 0.3px;
  }
  .sb-btn:hover:not(:disabled) {
    background: var(--sb-accent-hover);
    box-shadow: 0 0 20px var(--sb-accent-glow);
  }
  .sb-btn:active:not(:disabled) {
    transform: translateY(1px);
  }
  .sb-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .sb-btn-ghost {
    background: transparent;
    color: var(--sb-muted);
    border: 1px solid var(--sb-border);
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    transition: all 0.15s;
  }
  .sb-btn-ghost:hover {
    background: var(--sb-elevated);
    color: var(--sb-text);
    border-color: rgba(255,255,255,0.12);
  }

  .sb-btn-danger {
    background: transparent;
    color: var(--sb-danger);
    border: 1px solid rgba(248,113,113,0.25);
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    transition: all 0.15s;
  }
  .sb-btn-danger:hover {
    background: rgba(248,113,113,0.08);
    border-color: rgba(248,113,113,0.4);
  }
  .sb-btn-danger:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .sb-pin-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid var(--sb-dim);
    background: transparent;
    transition: all 0.2s;
  }
  .sb-pin-dot.filled {
    background: var(--sb-accent);
    border-color: var(--sb-accent);
    box-shadow: 0 0 8px var(--sb-accent-glow);
  }

  .sb-pin-key {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--sb-surface);
    border: 1px solid var(--sb-border);
    color: var(--sb-text);
    font-size: 20px;
    font-weight: 500;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.1s;
  }
  .sb-pin-key:hover {
    background: var(--sb-elevated);
    border-color: rgba(255,255,255,0.12);
  }
  .sb-pin-key:active {
    background: var(--sb-bg);
    transform: translateY(1px);
  }

  .sb-tx-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-radius: 8px;
    transition: background 0.12s;
  }
  .sb-tx-row:hover { background: var(--sb-elevated); }

  .sb-ledger-line { border-bottom: 1px solid var(--sb-border); }
  .sb-ledger-line:last-child { border-bottom: none; }

  .sb-stat-label {
    font-size: 11px;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--sb-muted);
    font-weight: 500;
  }

  .sb-mono {
    font-family: 'DM Mono', 'SF Mono', monospace;
    letter-spacing: 0.5px;
  }

  .sb-glow-green { text-shadow: 0 0 20px var(--sb-accent-glow); }

  .sb-error-banner {
    background: rgba(248,113,113,0.08);
    border: 1px solid rgba(248,113,113,0.2);
    border-radius: 8px;
    padding: 12px 16px;
    color: #fca5a5;
    font-size: 13px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .sb-progress-track {
    height: 8px;
    border-radius: 4px;
    background: var(--sb-elevated);
    overflow: hidden;
  }
  .sb-progress-fill {
    height: 100%;
    border-radius: 4px;
    background: linear-gradient(90deg, var(--sb-accent-dim), var(--sb-accent));
    box-shadow: 0 0 6px var(--sb-accent-glow);
    transition: width 0.5s ease;
  }

  .sb-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--sb-border);
    border-top-color: var(--sb-accent);
    border-radius: 50%;
    animation: sb-spin 0.8s linear infinite;
  }
  @keyframes sb-spin { to { transform: rotate(360deg); } }

  @keyframes sb-fade-in {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .sb-animate-in { animation: sb-fade-in 0.4s ease-out both; }

  .sb-scrollable::-webkit-scrollbar { width: 6px; }
  .sb-scrollable::-webkit-scrollbar-track { background: transparent; }
  .sb-scrollable::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
  .sb-scrollable::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

  .sb-icon-circle {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: var(--sb-accent-glow);
    border: 1px solid var(--sb-border-accent);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sb-tab {
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--sb-muted);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.15s;
    border-bottom: 2px solid transparent;
    font-family: 'DM Sans', sans-serif;
  }
  .sb-tab:hover { color: var(--sb-text); }
  .sb-tab.active {
    color: var(--sb-accent);
    border-bottom-color: var(--sb-accent);
  }
`;
