/**
 * Count Slopula custom CSS — gothic vampire crypt aesthetic.
 *
 * Deep crimsons, spectral purples, fog effects, dripping text,
 * coffin-shaped cards, and bat-wing animations. A horror movie
 * poster made of pure CSS.
 */

export const SLOPULA_STYLES = `
  .cs-root {
    --cs-bg: var(--bg-base, #0d0a1a);
    --cs-bg-surface: var(--bg-surface, #13101f);
    --cs-crimson: #dc143c;
    --cs-crimson-dim: #8b0a1e;
    --cs-crimson-glow: rgba(220, 20, 60, 0.2);
    --cs-crimson-glow-strong: rgba(220, 20, 60, 0.4);
    --cs-crimson-subtle: rgba(220, 20, 60, 0.08);
    --cs-purple: #6b21a8;
    --cs-purple-glow: rgba(107, 33, 168, 0.25);
    --cs-ghost: #c9b1ff;
    --cs-gold: #d4a833;
    --cs-gold-glow: rgba(212, 168, 51, 0.2);
    --cs-text: #f0e6ff;
    --cs-text-dim: #8b7da8;
    --cs-border: rgba(220, 20, 60, 0.15);
    --cs-border-bright: rgba(220, 20, 60, 0.4);
    --cs-fog: rgba(201, 177, 255, 0.04);

    font-family: 'Crimson Text', Georgia, 'Times New Roman', serif;
    color: var(--cs-text);
    background: var(--cs-bg);
  }

  /* ── Tab bar ── */

  .cs-tab-bar {
    display: flex;
    gap: 0;
    padding: 0 20px;
    border-bottom: 1px solid var(--cs-border);
    background: var(--cs-bg);
    flex-shrink: 0;
  }

  .cs-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.03em;
    cursor: pointer;
    color: var(--cs-text-dim);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
    font-family: 'Crimson Text', serif;
  }

  .cs-tab:hover {
    color: var(--cs-text);
  }

  .cs-tab.active {
    color: var(--cs-crimson);
    border-bottom-color: var(--cs-crimson);
  }

  .cs-tab-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    font-size: 10px;
    font-weight: 700;
    background: var(--cs-crimson-subtle);
    color: var(--cs-crimson-dim);
    border: 1px solid var(--cs-border);
  }

  .cs-tab.active .cs-tab-badge {
    background: var(--cs-crimson-glow);
    color: var(--cs-crimson);
    border-color: var(--cs-crimson);
  }

  /* ── Gothic typography ── */

  .cs-vampire-text {
    font-family: 'Creepster', Impact, fantasy;
    letter-spacing: 0.06em;
  }

  .cs-title {
    font-family: 'Creepster', Impact, fantasy;
    font-size: clamp(2.5rem, 6vw, 4.5rem);
    letter-spacing: 0.08em;
    background: linear-gradient(180deg, var(--cs-crimson) 0%, #6b0020 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 0 20px var(--cs-crimson-glow-strong))
            drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5));
    line-height: 1.1;
  }

  .cs-subtitle {
    font-size: 1.05rem;
    font-weight: 400;
    font-style: italic;
    letter-spacing: 0.06em;
    color: var(--cs-text-dim);
  }

  /* ── Fog / atmosphere ── */

  .cs-atmosphere {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  }

  .cs-atmosphere::before {
    content: '';
    position: absolute;
    top: -20%;
    left: 50%;
    transform: translateX(-50%);
    width: 140%;
    height: 70%;
    background: radial-gradient(
      ellipse at center,
      var(--cs-crimson-glow) 0%,
      transparent 55%
    );
    animation: cs-fog-drift 6s ease-in-out infinite;
  }

  .cs-atmosphere::after {
    content: '';
    position: absolute;
    bottom: -15%;
    right: -15%;
    width: 60%;
    height: 60%;
    background: radial-gradient(
      circle,
      var(--cs-purple-glow) 0%,
      transparent 55%
    );
    animation: cs-fog-drift 8s ease-in-out infinite reverse;
  }

  /* ── Mist overlay (instead of scanlines) ── */

  .cs-mist::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse at 20% 80%, var(--cs-fog) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 20%, var(--cs-fog) 0%, transparent 50%);
    pointer-events: none;
    z-index: 50;
    animation: cs-mist-shift 12s ease-in-out infinite;
  }

  /* ── Intensity cards (coffin-shaped) ── */

  .cs-intensity-card {
    position: relative;
    border: 1px solid var(--cs-border);
    border-radius: 4px 4px 12px 12px;
    padding: 20px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    background: var(--cs-bg-surface);
    overflow: hidden;
    clip-path: polygon(15% 0%, 85% 0%, 100% 8%, 100% 100%, 50% 96%, 0% 100%, 0% 8%);
  }

  .cs-intensity-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, var(--cs-crimson-subtle), transparent);
    opacity: 0;
    transition: opacity 0.3s;
  }

  .cs-intensity-card:hover::before {
    opacity: 1;
  }

  .cs-intensity-card:hover {
    border-color: var(--cs-border-bright);
    transform: translateY(-3px);
    box-shadow: 0 8px 40px var(--cs-crimson-glow);
  }

  .cs-intensity-card.selected {
    border-color: var(--cs-crimson);
    box-shadow: 0 0 25px var(--cs-crimson-glow), inset 0 0 25px var(--cs-crimson-subtle);
  }

  .cs-intensity-card.selected::before {
    opacity: 1;
  }

  /* ── Genre chip ── */

  .cs-genre-chip {
    display: inline-flex;
    align-items: center;
    padding: 7px 16px;
    border: 1px solid var(--cs-border);
    border-radius: 4px;
    font-size: 14px;
    font-weight: 400;
    font-style: italic;
    cursor: pointer;
    transition: all 0.2s;
    background: transparent;
    color: var(--cs-text-dim);
    user-select: none;
    font-family: 'Crimson Text', serif;
  }

  .cs-genre-chip:hover {
    border-color: var(--cs-border-bright);
    color: var(--cs-text);
  }

  .cs-genre-chip.selected {
    border-color: var(--cs-crimson);
    color: var(--cs-crimson);
    background: var(--cs-crimson-subtle);
  }

  /* ── Content card ── */

  .cs-content-card {
    position: relative;
    border: 1px solid var(--cs-border);
    border-radius: 4px;
    padding: 24px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    background: var(--cs-bg-surface);
    overflow: hidden;
  }

  .cs-content-card::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, transparent, var(--cs-crimson), transparent);
    opacity: 0;
    transition: opacity 0.3s;
  }

  .cs-content-card:hover {
    border-color: var(--cs-border-bright);
    transform: translateY(-4px) scale(1.01);
    box-shadow: 0 12px 50px var(--cs-crimson-glow);
  }

  .cs-content-card:hover::after {
    opacity: 1;
  }

  /* ── Blood meter (slop rating) ── */

  .cs-blood-meter {
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }

  .cs-blood-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* ── CTA button ── */

  .cs-cta {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 14px 36px;
    border: 1px solid var(--cs-crimson);
    border-radius: 4px;
    font-size: 17px;
    font-weight: 700;
    font-family: 'Creepster', fantasy;
    letter-spacing: 0.06em;
    cursor: pointer;
    color: var(--cs-crimson);
    background: transparent;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
  }

  .cs-cta::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, var(--cs-crimson-glow-strong), var(--cs-crimson-subtle));
    opacity: 0;
    transition: opacity 0.3s;
  }

  .cs-cta:hover:not(:disabled)::before {
    opacity: 1;
  }

  .cs-cta:hover:not(:disabled) {
    box-shadow: 0 0 40px var(--cs-crimson-glow), inset 0 0 30px var(--cs-crimson-subtle);
    transform: translateY(-2px);
    text-shadow: 0 0 20px var(--cs-crimson-glow-strong);
  }

  .cs-cta:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .cs-cta span {
    position: relative;
    z-index: 1;
  }

  /* ── Animations ── */

  @keyframes cs-fog-drift {
    0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1); }
    50% { opacity: 0.9; transform: translateX(-48%) scale(1.05); }
  }

  @keyframes cs-mist-shift {
    0%, 100% { opacity: 0.3; }
    33% { opacity: 0.6; }
    66% { opacity: 0.2; }
  }

  @keyframes cs-rise-from-grave {
    from { opacity: 0; transform: translateY(40px) scale(0.95); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes cs-fade-up {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes cs-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes cs-blood-drip {
    0% { transform: translateY(-100%); opacity: 0; }
    10% { opacity: 1; }
    90% { opacity: 1; }
    100% { transform: translateY(300%); opacity: 0; }
  }

  @keyframes cs-bat-flap {
    0%, 100% { transform: scaleX(1) translateY(0); }
    25% { transform: scaleX(0.7) translateY(-8px); }
    50% { transform: scaleX(1.1) translateY(-4px); }
    75% { transform: scaleX(0.8) translateY(-10px); }
  }

  @keyframes cs-float {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    33% { transform: translateY(-6px) rotate(1deg); }
    66% { transform: translateY(-3px) rotate(-1deg); }
  }

  @keyframes cs-heartbeat {
    0%, 100% { transform: scale(1); }
    14% { transform: scale(1.1); }
    28% { transform: scale(1); }
    42% { transform: scale(1.05); }
    56% { transform: scale(1); }
  }

  @keyframes cs-flicker {
    0%, 100% { opacity: 1; }
    3% { opacity: 0.4; }
    6% { opacity: 1; }
    7% { opacity: 0.6; }
    9% { opacity: 1; }
    50% { opacity: 1; }
    52% { opacity: 0.7; }
    53% { opacity: 1; }
  }

  @keyframes cs-dot-pulse {
    0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1.3); }
  }

  @keyframes cs-coffin-open {
    from { opacity: 0; transform: perspective(400px) rotateX(-15deg) translateY(30px); }
    to { opacity: 1; transform: perspective(400px) rotateX(0deg) translateY(0); }
  }

  @keyframes cs-shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-3px); }
    20%, 40%, 60%, 80% { transform: translateX(3px); }
  }

  .cs-animate-float { animation: cs-float 4s ease-in-out infinite; }
  .cs-animate-fade-up { animation: cs-fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .cs-animate-heartbeat { animation: cs-heartbeat 2s ease-in-out infinite; }
  .cs-animate-flicker { animation: cs-flicker 4s ease-in-out infinite; }
  .cs-animate-bat { animation: cs-bat-flap 1.2s ease-in-out infinite; }
  .cs-animate-shake { animation: cs-shake 0.6s ease-in-out; }

  .cs-card-enter-1 { animation: cs-coffin-open 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both; }
  .cs-card-enter-2 { animation: cs-coffin-open 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both; }
  .cs-card-enter-3 { animation: cs-coffin-open 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.5s both; }

  /* ── Loading drops (blood drip) ── */

  .cs-loading-drop {
    width: 6px;
    height: 10px;
    border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
    background: var(--cs-crimson);
    animation: cs-dot-pulse 1.4s ease-in-out infinite;
  }

  .cs-loading-drop:nth-child(2) { animation-delay: 0.2s; }
  .cs-loading-drop:nth-child(3) { animation-delay: 0.4s; }

  /* ── Slop slider (remix phase) ── */

  .cs-slop-slider {
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.06);
    outline: none;
    cursor: pointer;
  }

  .cs-slop-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--cs-crimson);
    border: 2px solid var(--cs-bg);
    box-shadow: 0 0 8px var(--cs-crimson-glow);
    cursor: pointer;
    transition: box-shadow 0.2s;
  }

  .cs-slop-slider::-webkit-slider-thumb:hover {
    box-shadow: 0 0 16px var(--cs-crimson-glow-strong);
  }

  /* ── Line clamp utility ── */

  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .line-clamp-4 {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
`;
