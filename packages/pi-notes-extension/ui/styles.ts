/**
 * Custom CSS styles for the Notes app.
 * Uses Sero theme variables with local fallbacks.
 */

export const NOTES_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300;1,9..40,400&display=swap');

  .nt-root {
    --nt-bg: #0f1117;
    --nt-bg-surface: #191b23;
    --nt-bg-elevated: #22252f;
    --nt-text: #e8e4df;
    --nt-muted: #8b8d97;
    --nt-dim: #5c5e6a;
    --nt-accent: #818cf8;
    --nt-accent-hover: #a5b4fc;
    --nt-accent-glow: rgba(129, 140, 248, 0.12);
    --nt-success: #34d399;
    --nt-danger: #f87171;
    --nt-border: rgba(255, 255, 255, 0.07);
    --nt-amber: #fbbf24;

    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    background: var(--nt-bg);
    color: var(--nt-text);
  }

  @supports (color: var(--bg-base)) {
    .nt-root {
      --nt-bg: var(--bg-base, #0f1117);
      --nt-bg-surface: var(--bg-surface, #191b23);
      --nt-bg-elevated: var(--bg-elevated, #22252f);
      --nt-text: var(--text-primary, #e8e4df);
      --nt-border: var(--border, rgba(255, 255, 255, 0.07));
    }
  }

  .nt-root h1, .nt-root h2 {
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    font-weight: 500;
  }

  .nt-card {
    background: var(--nt-bg-surface);
    border: 1px solid var(--nt-border);
    border-radius: 12px;
    width: 100%;
  }

  .nt-input {
    background: var(--nt-bg-elevated);
    border: 1px solid var(--nt-border);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
    color: var(--nt-text);
    font-family: 'DM Sans', sans-serif;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
  }
  .nt-input::placeholder { color: var(--nt-dim); }
  .nt-input:focus { border-color: var(--nt-accent); }

  .nt-textarea {
    background: var(--nt-bg-elevated);
    border: 1px solid var(--nt-border);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--nt-text);
    font-family: 'DM Sans', sans-serif;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
    resize: vertical;
    min-height: 120px;
  }
  .nt-textarea::placeholder { color: var(--nt-dim); }
  .nt-textarea:focus { border-color: var(--nt-accent); }

  .nt-button {
    background: var(--nt-accent);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 500;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .nt-button:hover:not(:disabled) {
    background: var(--nt-accent-hover);
    box-shadow: 0 0 20px var(--nt-accent-glow);
  }
  .nt-button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .nt-button-ghost {
    background: none;
    color: var(--nt-muted);
    border: none;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 500;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    transition: all 0.15s;
  }
  .nt-button-ghost:hover {
    color: var(--nt-text);
    background: var(--nt-bg-elevated);
  }

  .nt-note-card {
    padding: 14px 16px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.12s;
    border: 1px solid transparent;
  }
  .nt-note-card:hover {
    background: var(--nt-bg-elevated);
  }
  .nt-note-card.active {
    background: var(--nt-bg-elevated);
    border-color: var(--nt-accent);
  }

  .nt-pin-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    color: var(--nt-dim);
    transition: all 0.12s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .nt-pin-btn:hover {
    color: var(--nt-amber);
    background: rgba(251, 191, 36, 0.1);
  }
  .nt-pin-btn.pinned {
    color: var(--nt-amber);
  }

  .nt-delete-btn {
    opacity: 0;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    color: var(--nt-dim);
    transition: all 0.12s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .nt-note-card:hover .nt-delete-btn {
    opacity: 1;
  }
  .nt-delete-btn:hover {
    color: var(--nt-danger);
    background: rgba(248, 113, 113, 0.1);
  }

  .nt-search {
    background: var(--nt-bg-elevated);
    border: 1px solid var(--nt-border);
    border-radius: 8px;
    padding: 6px 10px 6px 32px;
    font-size: 12px;
    color: var(--nt-text);
    font-family: 'DM Sans', sans-serif;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
  }
  .nt-search::placeholder { color: var(--nt-dim); }
  .nt-search:focus { border-color: var(--nt-accent); }

  .nt-empty-orb {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 40%, var(--nt-accent) 0%, transparent 70%);
    opacity: 0.15;
    animation: nt-pulse 3s ease-in-out infinite;
  }

  @keyframes nt-pulse {
    0%, 100% { transform: scale(1); opacity: 0.15; }
    50% { transform: scale(1.1); opacity: 0.25; }
  }

  @keyframes nt-fade-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .nt-animate-in {
    animation: nt-fade-in 0.3s ease-out both;
  }

  .nt-divider {
    width: 1px;
    background: var(--nt-border);
    flex-shrink: 0;
  }
`;
