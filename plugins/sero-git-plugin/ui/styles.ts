/**
 * Custom CSS for the Git app.
 *
 * There is no private colour theme here. Scoped plugins inherit the host's
 * design tokens by ordinary custom-property inheritance, so the app uses
 * `--bg-*`, `--text-*`, `--border-*`, `--brand-*` and `--status-*` directly —
 * the same names the rest of Sero uses (AD-025). What remains is the handful of
 * things Tailwind utilities cannot express: scrollbar chrome, and the reduced
 * motion escape hatch.
 */

export const GIT_STYLES = `
  .git-root {
    font-family: var(--font-sans);
    background: var(--bg-base);
    color: var(--text-primary);
  }

  .git-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
  .git-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .git-scrollbar::-webkit-scrollbar-thumb {
    background: var(--border-default);
    border-radius: 4px;
  }
  .git-scrollbar::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }

  .git-mono { font-family: var(--font-mono); }

  @media (prefers-reduced-motion: reduce) {
    .git-root,
    .git-root::before,
    .git-root::after,
    .git-root *,
    .git-root *::before,
    .git-root *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }
`;
