/**
 * Custom CSS for the Git app.
 *
 * Uses CSS custom properties with fallbacks to Sero theme tokens.
 * DM Sans typography matches the Sero design system.
 */

export const GIT_STYLES = `
  .git-root {
    --g-bg: #0c0e14;
    --g-surface: #14161e;
    --g-elevated: #1c1e28;
    --g-hover: #22242e;
    --g-text: #e8e4df;
    --g-muted: #8b8d97;
    --g-dim: #5c5e6a;
    --g-accent: #818cf8;
    --g-accent-hover: #a5b4fc;
    --g-green: #34d399;
    --g-red: #f87171;
    --g-yellow: #fbbf24;
    --g-blue: #60a5fa;
    --g-border: rgba(255, 255, 255, 0.06);
    --g-border-bright: rgba(255, 255, 255, 0.10);
    --g-glow: rgba(129, 140, 248, 0.08);
    --g-mono: ui-monospace, 'SF Mono', 'Fira Code', monospace;

    font-family: Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif;
    background: var(--g-bg);
    color: var(--g-text);
  }

  @supports (color: var(--bg-base)) {
    .git-root {
      --g-bg: var(--bg-base, #0c0e14);
      --g-surface: var(--bg-surface, #14161e);
      --g-elevated: var(--bg-elevated, #1c1e28);
      --g-text: var(--text-primary, #e8e4df);
      --g-border: var(--border, rgba(255, 255, 255, 0.06));
    }
  }

  .git-root h1, .git-root h2, .git-root h3, .git-root h4 {
    font-family: Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif;
  }

  .git-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
  .git-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .git-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.07);
    border-radius: 4px;
  }
  .git-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.14);
  }

  .git-mono { font-family: var(--g-mono); }

  /* Diff line colors */
  .diff-add { background: rgba(52, 211, 153, 0.08); }
  .diff-add-text { color: #6ee7b7; }
  .diff-del { background: rgba(248, 113, 113, 0.08); }
  .diff-del-text { color: #fca5a5; }
  .diff-hunk { background: rgba(129, 140, 248, 0.06); color: var(--g-accent); }

  /* Graph selected row */
  .graph-row-selected { background: rgba(129, 140, 248, 0.08) !important; }
  .graph-row:hover { background: rgba(255, 255, 255, 0.02); }

  /* Subtle glow animation for loading */
  @keyframes git-pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
  .git-loading { animation: git-pulse 1.5s ease-in-out infinite; }
`;
