/**
 * Calculator CSS — modern iOS/Android-inspired dark theme.
 *
 * Uses CSS custom properties that inherit from Sero's theme when
 * running inside the shell, with standalone fallbacks.
 */

export const CALC_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');

  .calc-root {
    --calc-bg: #0a0a0f;
    --calc-surface: #17171f;
    --calc-elevated: #1f1f2b;
    --calc-text: #f0eff4;
    --calc-muted: #7a7a8c;
    --calc-dim: #4a4a58;
    --calc-accent: #4f8cff;
    --calc-accent-hover: #6da1ff;
    --calc-accent-glow: rgba(79, 140, 255, 0.15);
    --calc-orange: #ff9f43;
    --calc-orange-hover: #ffb76b;
    --calc-orange-glow: rgba(255, 159, 67, 0.15);
    --calc-danger: #ff6b6b;
    --calc-border: rgba(255, 255, 255, 0.06);

    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background: var(--calc-bg);
    color: var(--calc-text);
  }

  @supports (color: var(--bg-base)) {
    .calc-root {
      --calc-bg: var(--bg-base, #0a0a0f);
      --calc-surface: var(--bg-surface, #17171f);
      --calc-elevated: var(--bg-elevated, #1f1f2b);
      --calc-text: var(--text-primary, #f0eff4);
      --calc-border: var(--border, rgba(255, 255, 255, 0.06));
    }
  }

  /* ── Display area ─────────────────────────────────── */

  .calc-display {
    background: var(--calc-surface);
    border: 1px solid var(--calc-border);
    border-radius: 16px;
    padding: 20px 24px;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: flex-end;
    overflow: hidden;
  }

  .calc-expression {
    font-size: 14px;
    color: var(--calc-muted);
    font-weight: 400;
    letter-spacing: 0.02em;
    min-height: 20px;
    word-break: break-all;
    text-align: right;
    width: 100%;
  }

  .calc-result {
    font-size: 42px;
    font-weight: 300;
    letter-spacing: -0.02em;
    color: var(--calc-text);
    line-height: 1.1;
    word-break: break-all;
    text-align: right;
    width: 100%;
    transition: font-size 0.15s ease;
  }

  .calc-result.long {
    font-size: 28px;
  }

  .calc-result.very-long {
    font-size: 20px;
  }

  /* ── Button grid ──────────────────────────────────── */

  .calc-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }

  .calc-btn {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 18px;
    font-weight: 400;
    border: none;
    border-radius: 14px;
    padding: 0;
    height: 60px;
    cursor: pointer;
    transition: all 0.12s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    -webkit-user-select: none;
    position: relative;
    overflow: hidden;
  }

  .calc-btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: white;
    opacity: 0;
    transition: opacity 0.15s;
    border-radius: inherit;
  }

  .calc-btn:active::after {
    opacity: 0.08;
  }

  /* Number buttons */
  .calc-btn-num {
    background: var(--calc-elevated);
    color: var(--calc-text);
    border: 1px solid var(--calc-border);
  }
  .calc-btn-num:hover {
    background: #282838;
  }

  /* Operator buttons */
  .calc-btn-op {
    background: var(--calc-orange);
    color: #fff;
    font-weight: 500;
    font-size: 20px;
  }
  .calc-btn-op:hover {
    background: var(--calc-orange-hover);
    box-shadow: 0 0 20px var(--calc-orange-glow);
  }
  .calc-btn-op.active {
    background: var(--calc-orange-hover);
    box-shadow: 0 0 24px var(--calc-orange-glow);
  }

  /* Function buttons (C, +/-, %) */
  .calc-btn-fn {
    background: var(--calc-surface);
    color: var(--calc-muted);
    border: 1px solid var(--calc-border);
    font-weight: 500;
  }
  .calc-btn-fn:hover {
    background: var(--calc-elevated);
    color: var(--calc-text);
  }

  /* Equals button */
  .calc-btn-eq {
    background: var(--calc-accent);
    color: #fff;
    font-weight: 500;
    font-size: 22px;
  }
  .calc-btn-eq:hover {
    background: var(--calc-accent-hover);
    box-shadow: 0 0 20px var(--calc-accent-glow);
  }

  /* Zero button (spans 2 columns) */
  .calc-btn-zero {
    grid-column: span 2;
  }

  /* ── History panel ────────────────────────────────── */

  .calc-history-panel {
    background: var(--calc-surface);
    border: 1px solid var(--calc-border);
    border-radius: 16px;
    overflow: hidden;
  }

  .calc-history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--calc-border);
  }

  .calc-history-item {
    padding: 10px 16px;
    border-bottom: 1px solid var(--calc-border);
    cursor: pointer;
    transition: background 0.12s;
  }
  .calc-history-item:last-child {
    border-bottom: none;
  }
  .calc-history-item:hover {
    background: var(--calc-elevated);
  }

  .calc-history-expr {
    font-size: 12px;
    color: var(--calc-muted);
    margin-bottom: 2px;
  }

  .calc-history-result {
    font-size: 16px;
    font-weight: 400;
    color: var(--calc-text);
  }

  .calc-history-clear {
    background: none;
    border: none;
    color: var(--calc-dim);
    font-size: 12px;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: all 0.12s;
  }
  .calc-history-clear:hover {
    color: var(--calc-danger);
    background: rgba(255, 107, 107, 0.1);
  }

  .calc-history-toggle {
    background: none;
    border: none;
    color: var(--calc-dim);
    font-size: 12px;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    padding: 6px 12px;
    border-radius: 8px;
    transition: all 0.12s;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .calc-history-toggle:hover {
    color: var(--calc-muted);
    background: var(--calc-elevated);
  }

  /* ── Animations ───────────────────────────────────── */

  @keyframes calc-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .calc-animate-in {
    animation: calc-fade-in 0.2s ease-out both;
  }
`;
