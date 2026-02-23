/**
 * SlopZilla custom CSS — kaiju-sized radioactive slop aesthetic.
 *
 * Neon green (#39ff14) radioactive theme with dark backgrounds,
 * dramatic typography, monster-movie poster vibes, and CSS animations.
 */

export const SLOP_STYLES = `
  .sz-root {
    --sz-bg: var(--bg-base, #0a0a0f);
    --sz-bg-surface: var(--bg-surface, #111118);
    --sz-neon: #39ff14;
    --sz-neon-dim: #1a8a0a;
    --sz-neon-glow: rgba(57, 255, 20, 0.15);
    --sz-neon-glow-strong: rgba(57, 255, 20, 0.3);
    --sz-neon-subtle: rgba(57, 255, 20, 0.06);
    --sz-orange: #ff6b2b;
    --sz-orange-glow: rgba(255, 107, 43, 0.2);
    --sz-red: #ff2b5e;
    --sz-purple: #b44aff;
    --sz-text: #e8e8f0;
    --sz-text-dim: #8888a0;
    --sz-border: rgba(57, 255, 20, 0.12);
    --sz-border-bright: rgba(57, 255, 20, 0.3);

    font-family: 'Outfit', system-ui, sans-serif;
    color: var(--sz-text);
    background: var(--sz-bg);
  }

  /* ── Tab bar ── */

  .sz-tab-bar {
    display: flex;
    gap: 0;
    padding: 0 20px;
    border-bottom: 1px solid var(--sz-border);
    background: var(--sz-bg);
    flex-shrink: 0;
  }

  .sz-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.04em;
    cursor: pointer;
    color: var(--sz-text-dim);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
    font-family: 'Outfit', sans-serif;
  }

  .sz-tab:hover {
    color: var(--sz-text);
  }

  .sz-tab.active {
    color: var(--sz-neon);
    border-bottom-color: var(--sz-neon);
  }

  .sz-tab-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    font-size: 10px;
    font-weight: 700;
    background: var(--sz-neon-subtle);
    color: var(--sz-neon-dim);
    border: 1px solid var(--sz-border);
  }

  .sz-tab.active .sz-tab-badge {
    background: var(--sz-neon-glow);
    color: var(--sz-neon);
    border-color: var(--sz-neon);
  }

  /* ── Godzilla ASCII art ── */

  .sz-kaiju-text {
    font-family: 'Bangers', Impact, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .sz-title {
    font-family: 'Bangers', Impact, sans-serif;
    font-size: clamp(2.5rem, 6vw, 4.5rem);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: linear-gradient(180deg, var(--sz-neon) 0%, var(--sz-neon-dim) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 0 20px var(--sz-neon-glow-strong));
    line-height: 1.1;
  }

  .sz-subtitle {
    font-size: 1rem;
    font-weight: 300;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--sz-text-dim);
  }

  /* ── Atmosphere ── */

  .sz-atmosphere {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  }

  .sz-atmosphere::before {
    content: '';
    position: absolute;
    top: -20%;
    left: 50%;
    transform: translateX(-50%);
    width: 120%;
    height: 70%;
    background: radial-gradient(
      ellipse at center,
      var(--sz-neon-glow) 0%,
      transparent 60%
    );
    animation: sz-pulse-glow 4s ease-in-out infinite;
  }

  .sz-atmosphere::after {
    content: '';
    position: absolute;
    bottom: -10%;
    right: -10%;
    width: 50%;
    height: 50%;
    background: radial-gradient(
      circle,
      var(--sz-orange-glow) 0%,
      transparent 60%
    );
    animation: sz-pulse-glow 6s ease-in-out infinite reverse;
  }

  /* ── Scanlines overlay ── */

  .sz-scanlines::before {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.03) 2px,
      rgba(0, 0, 0, 0.03) 4px
    );
    pointer-events: none;
    z-index: 50;
  }

  /* ── Complexity cards ── */

  .sz-complexity-card {
    position: relative;
    border: 1px solid var(--sz-border);
    border-radius: 12px;
    padding: 20px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    background: var(--sz-bg-surface);
    overflow: hidden;
  }

  .sz-complexity-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, var(--sz-neon-subtle), transparent);
    opacity: 0;
    transition: opacity 0.3s;
    border-radius: inherit;
  }

  .sz-complexity-card:hover::before {
    opacity: 1;
  }

  .sz-complexity-card:hover {
    border-color: var(--sz-border-bright);
    transform: translateY(-2px);
    box-shadow: 0 4px 30px var(--sz-neon-glow);
  }

  .sz-complexity-card.selected {
    border-color: var(--sz-neon);
    box-shadow: 0 0 20px var(--sz-neon-glow), inset 0 0 20px var(--sz-neon-subtle);
  }

  .sz-complexity-card.selected::before {
    opacity: 1;
  }

  /* ── Tech chip ── */

  .sz-tech-chip {
    display: inline-flex;
    align-items: center;
    padding: 6px 14px;
    border: 1px solid var(--sz-border);
    border-radius: 100px;
    font-size: 13px;
    font-weight: 400;
    cursor: pointer;
    transition: all 0.2s;
    background: transparent;
    color: var(--sz-text-dim);
    user-select: none;
  }

  .sz-tech-chip:hover {
    border-color: var(--sz-border-bright);
    color: var(--sz-text);
  }

  .sz-tech-chip.selected {
    border-color: var(--sz-neon);
    color: var(--sz-neon);
    background: var(--sz-neon-subtle);
  }

  /* ── Idea card ── */

  .sz-idea-card {
    position: relative;
    border: 1px solid var(--sz-border);
    border-radius: 16px;
    padding: 24px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    background: var(--sz-bg-surface);
    overflow: hidden;
  }

  .sz-idea-card:hover {
    border-color: var(--sz-border-bright);
    transform: translateY(-4px) scale(1.01);
    box-shadow: 0 8px 40px var(--sz-neon-glow);
  }

  /* ── Slop meter ── */

  .sz-slop-meter {
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .sz-slop-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* ── CTA button ── */

  .sz-cta {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 14px 36px;
    border: 1px solid var(--sz-neon);
    border-radius: 100px;
    font-size: 16px;
    font-weight: 600;
    font-family: 'Outfit', sans-serif;
    letter-spacing: 0.04em;
    cursor: pointer;
    color: var(--sz-neon);
    background: transparent;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
  }

  .sz-cta::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, var(--sz-neon-glow-strong), var(--sz-neon-subtle));
    opacity: 0;
    transition: opacity 0.3s;
    border-radius: inherit;
  }

  .sz-cta:hover:not(:disabled)::before {
    opacity: 1;
  }

  .sz-cta:hover:not(:disabled) {
    box-shadow: 0 0 30px var(--sz-neon-glow), inset 0 0 30px var(--sz-neon-subtle);
    transform: translateY(-2px);
  }

  .sz-cta:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .sz-cta span {
    position: relative;
    z-index: 1;
  }

  /* ── Animations ── */

  @keyframes sz-pulse-glow {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }

  @keyframes sz-stomp {
    0%, 100% { transform: translateY(0); }
    15% { transform: translateY(-12px) rotate(-2deg); }
    30% { transform: translateY(4px) rotate(1deg); }
    45% { transform: translateY(-8px) rotate(-1deg); }
    60% { transform: translateY(2px); }
  }

  @keyframes sz-fade-up {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes sz-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes sz-slide-in {
    from { opacity: 0; transform: translateX(-20px); }
    to { opacity: 1; transform: translateX(0); }
  }

  @keyframes sz-breathe {
    0%, 100% { text-shadow: 0 0 10px var(--sz-neon-glow); }
    50% { text-shadow: 0 0 30px var(--sz-neon-glow-strong), 0 0 60px var(--sz-neon-glow); }
  }

  @keyframes sz-fire-breath {
    0% { transform: scaleX(0); opacity: 0; }
    20% { transform: scaleX(0.3); opacity: 1; }
    100% { transform: scaleX(1); opacity: 0; }
  }

  @keyframes sz-dot-pulse {
    0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1.3); }
  }

  @keyframes sz-card-enter {
    from { opacity: 0; transform: translateY(30px) scale(0.95); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes sz-shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-3px); }
    20%, 40%, 60%, 80% { transform: translateX(3px); }
  }

  .sz-animate-stomp { animation: sz-stomp 2s ease-in-out infinite; }
  .sz-animate-fade-up { animation: sz-fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .sz-animate-breathe { animation: sz-breathe 3s ease-in-out infinite; }
  .sz-animate-shake { animation: sz-shake 0.6s ease-in-out; }

  .sz-card-enter-1 { animation: sz-card-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both; }
  .sz-card-enter-2 { animation: sz-card-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.25s both; }
  .sz-card-enter-3 { animation: sz-card-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both; }

  /* ── Loading dots ── */

  .sz-loading-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--sz-neon);
    animation: sz-dot-pulse 1.4s ease-in-out infinite;
  }

  .sz-loading-dot:nth-child(2) { animation-delay: 0.2s; }
  .sz-loading-dot:nth-child(3) { animation-delay: 0.4s; }

  /* ── Fire breath beam ── */

  .sz-fire-beam {
    height: 4px;
    background: linear-gradient(90deg, var(--sz-neon), var(--sz-orange), transparent);
    transform-origin: left;
    animation: sz-fire-breath 1.5s ease-out infinite;
    border-radius: 2px;
  }

  /* ── Slop slider (remix phase) ── */

  .sz-slop-slider {
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    outline: none;
    cursor: pointer;
  }

  .sz-slop-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--sz-neon);
    border: 2px solid var(--sz-bg);
    box-shadow: 0 0 8px var(--sz-neon-glow);
    cursor: pointer;
    transition: box-shadow 0.2s;
  }

  .sz-slop-slider::-webkit-slider-thumb:hover {
    box-shadow: 0 0 16px var(--sz-neon-glow-strong);
  }

  /* ── Line clamp utility ── */

  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
`;
