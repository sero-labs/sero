/**
 * DailyQuote — main Sero web UI for the daily quote extension.
 *
 * Displays a daily inspirational quote with a warm editorial aesthetic.
 * Uses useAI to generate quotes via the app's dedicated agent session —
 * no active chat session required.
 *
 * Design: editorial/literary — warm amber accents, Playfair Display serif,
 * atmospheric layered background, decorative typographic elements.
 */

import { useMemo, useCallback, useState } from 'react';
import { useAppState, useAI } from '@sero-ai/app-runtime';
import type { DailyQuoteState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

// ── Styles ───────────────────────────────────────────────────

const CUSTOM_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Outfit:wght@300;400;500;600&display=swap');

  .dq-root {
    /* Light mode defaults */
    --dq-bg: var(--bg-base, #ffffff);
    --dq-bg-surface: var(--bg-surface, #f4f5f7);
    --dq-bg-warm: #f0ece6;
    --dq-text: #1a1612;
    --dq-text-soft: #3d3529;
    --dq-muted: #6b6158;
    --dq-dim: #8a8078;
    --dq-accent: #9a6b3a;
    --dq-accent-light: #7a5428;
    --dq-accent-glow: rgba(154, 107, 58, 0.06);
    --dq-accent-glow-strong: rgba(154, 107, 58, 0.12);
    --dq-border: var(--border-default, rgba(154, 107, 58, 0.15));
    --dq-border-accent: rgba(154, 107, 58, 0.25);

    font-family: 'Outfit', system-ui, -apple-system, sans-serif;
    color: var(--dq-text);
    background: var(--dq-bg);
  }

  /* Dark mode overrides */
  .dark .dq-root {
    --dq-bg: var(--bg-base, #110f14);
    --dq-bg-surface: var(--bg-surface, #18151d);
    --dq-bg-warm: #1c1820;
    --dq-text: #f0ebe3;
    --dq-text-soft: #d4cfc7;
    --dq-muted: #8a8389;
    --dq-dim: #5c585f;
    --dq-accent: #d4a574;
    --dq-accent-light: #e8c89e;
    --dq-accent-glow: rgba(212, 165, 116, 0.08);
    --dq-accent-glow-strong: rgba(212, 165, 116, 0.15);
    --dq-border: var(--border-default, rgba(212, 165, 116, 0.08));
    --dq-border-accent: rgba(212, 165, 116, 0.2);
  }

  /* ── Atmospheric background ── */

  .dq-atmosphere {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  }

  .dq-atmosphere::before {
    content: '';
    position: absolute;
    top: -30%;
    left: 50%;
    transform: translateX(-50%);
    width: 140%;
    height: 80%;
    background: radial-gradient(
      ellipse at center,
      var(--dq-accent-glow) 0%,
      transparent 60%
    );
  }

  .dq-atmosphere::after {
    content: '';
    position: absolute;
    bottom: -20%;
    left: 50%;
    transform: translateX(-50%);
    width: 120%;
    height: 60%;
    background: radial-gradient(
      ellipse at center,
      var(--dq-accent-glow) 0%,
      transparent 60%
    );
  }

  /* ── Card ── */

  .dq-card {
    position: relative;
    background:
      linear-gradient(
        180deg,
        var(--dq-accent-glow) 0%,
        transparent 30%,
        transparent 70%,
        var(--dq-accent-glow) 100%
      ),
      var(--dq-bg-surface);
    border: 1px solid var(--dq-border);
    border-radius: 16px;
    overflow: hidden;
  }

  .dq-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 60%;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      var(--dq-border-accent),
      transparent
    );
  }

  /* ── Typography ── */

  .dq-quote-text {
    font-family: 'Playfair Display', Georgia, 'Times New Roman', serif;
    font-weight: 400;
    font-style: italic;
    line-height: 1.65;
    letter-spacing: 0.01em;
    font-size: clamp(1.75rem, 4vw, 2.75rem);
  }

  .dq-quote-mark {
    font-family: 'Playfair Display', Georgia, serif;
    font-weight: 600;
    font-style: normal;
    line-height: 0.5;
    background: linear-gradient(
      180deg,
      var(--dq-accent) 0%,
      var(--dq-accent-light) 100%
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    user-select: none;
    display: inline;
    vertical-align: text-top;
  }

  /* ── Divider ── */

  .dq-divider {
    width: 60px;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      var(--dq-accent),
      transparent
    );
    opacity: 0.5;
  }

  /* ── Button ── */

  .dq-button {
    position: relative;
    background: transparent;
    color: var(--dq-accent-light);
    border: 1px solid var(--dq-border-accent);
    border-radius: 100px;
    padding: 12px 32px;
    font-size: 14px;
    font-weight: 500;
    font-family: 'Outfit', sans-serif;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
  }

  .dq-button::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      var(--dq-accent-glow-strong),
      var(--dq-accent-glow)
    );
    opacity: 0;
    transition: opacity 0.3s;
    border-radius: inherit;
  }

  .dq-button:hover:not(:disabled)::before {
    opacity: 1;
  }

  .dq-button:hover:not(:disabled) {
    border-color: var(--dq-accent);
    color: var(--dq-accent-light);
    box-shadow:
      0 0 30px var(--dq-accent-glow),
      inset 0 0 30px var(--dq-accent-glow);
    transform: translateY(-1px);
  }

  .dq-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .dq-button:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .dq-button span {
    position: relative;
    z-index: 1;
  }

  /* ── Animations ── */

  @keyframes dq-fade-up {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes dq-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes dq-scale-in {
    from { opacity: 0; transform: scale(0.92); }
    to { opacity: 1; transform: scale(1); }
  }

  .dq-animate-quote {
    animation: dq-scale-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
  }

  .dq-animate-mark {
    animation: dq-fade-in 0.8s ease-out 0s both;
  }

  .dq-animate-text {
    animation: dq-fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;
  }

  .dq-animate-divider {
    animation: dq-fade-in 0.6s ease-out 0.4s both;
  }

  .dq-animate-author {
    animation: dq-fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.5s both;
  }

  .dq-animate-button {
    animation: dq-fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.7s both;
  }

  .dq-animate-empty {
    animation: dq-fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  /* ── Loading ── */

  .dq-loading-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--dq-accent);
    animation: dq-dot-pulse 1.4s ease-in-out infinite;
  }

  .dq-loading-dot:nth-child(2) { animation-delay: 0.2s; }
  .dq-loading-dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes dq-dot-pulse {
    0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1.2); }
  }

  /* ── Empty state orb ── */

  .dq-orb-ring {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    border: 1px solid var(--dq-border-accent);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: dq-orb-breathe 5s ease-in-out infinite;
  }

  .dq-orb-ring::after {
    content: '';
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: radial-gradient(circle, var(--dq-accent) 0%, transparent 70%);
    opacity: 0.25;
  }

  @keyframes dq-orb-breathe {
    0%, 100% { transform: scale(1); border-color: var(--dq-border-accent); }
    50% { transform: scale(1.05); border-color: var(--dq-accent); }
  }

  /* ── Ornamental corners ── */

  .dq-corner {
    position: absolute;
    width: 24px;
    height: 24px;
    opacity: 0.15;
  }

  .dq-corner svg {
    width: 100%;
    height: 100%;
  }

  .dq-corner--tl { top: 16px; left: 16px; }
  .dq-corner--tr { top: 16px; right: 16px; transform: scaleX(-1); }
  .dq-corner--bl { bottom: 16px; left: 16px; transform: scaleY(-1); }
  .dq-corner--br { bottom: 16px; right: 16px; transform: scale(-1); }
`;

// ── Corner Ornament SVG ──────────────────────────────────────

function CornerOrnament() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M0 12 Q0 0, 12 0" style={{ color: 'var(--dq-accent)' }} />
      <path d="M0 8 Q0 0, 8 0" style={{ color: 'var(--dq-accent)', opacity: 0.5 }} />
    </svg>
  );
}

// ── Quote parsing ────────────────────────────────────────────

function parseQuoteResponse(response: string): { text: string; author: string } | null {
  const quoteMatch = response.match(/["""](.+?)["""]\s*[—–-]\s*(.+?)$/ms);
  if (quoteMatch) {
    return { text: quoteMatch[1].trim(), author: quoteMatch[2].trim() };
  }

  const labelMatch = response.match(/QUOTE:\s*(.+?)\s*AUTHOR:\s*(.+)/si);
  if (labelMatch) {
    return { text: labelMatch[1].trim().replace(/^[""]|[""]$/g, ''), author: labelMatch[2].trim() };
  }

  const lines = response.trim().split('\n').filter(Boolean);
  if (lines.length >= 2) {
    const lastLine = lines[lines.length - 1];
    const authorMatch = lastLine.match(/^[—–-]\s*(.+)/);
    if (authorMatch) {
      const text = lines.slice(0, -1).join(' ').replace(/^[""]|[""]$/g, '').trim();
      return { text, author: authorMatch[1].trim() };
    }
  }

  return null;
}

// ── Main Component ───────────────────────────────────────────

export function DailyQuote() {
  const [state, updateState] = useAppState<DailyQuoteState>(DEFAULT_STATE);
  const ai = useAI();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const isStale = !state.quote || state.lastRefreshDate !== today;

  const requestQuote = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await ai.prompt(
        'Generate a single unique, thoughtful inspirational quote. Pick a real historical figure, philosopher, author, scientist, or leader as the author. Make it motivating and not cliché — avoid overused quotes. Respond in exactly this format on two lines:\n\n"The quote text here"\n— Author Name',
      );

      const parsed = parseQuoteResponse(response);
      if (!parsed) {
        setError('Could not parse the quote. Try again.');
        return;
      }

      updateState(() => ({
        quote: {
          text: parsed.text,
          author: parsed.author,
          generatedAt: new Date().toISOString(),
        },
        lastRefreshDate: today,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate quote');
    } finally {
      setLoading(false);
    }
  }, [ai, today, updateState]);

  return (
    <>
      <style>{CUSTOM_STYLES}</style>
      <div className="dq-root flex h-full w-full flex-col overflow-hidden p-4">
        <div className="dq-card flex flex-1 flex-col overflow-hidden relative p-4">
          {/* Atmospheric background glow */}
          <div className="dq-atmosphere" />

          {/* Ornamental corners */}
          <div className="dq-corner dq-corner--tl"><CornerOrnament /></div>
          <div className="dq-corner dq-corner--tr"><CornerOrnament /></div>
          <div className="dq-corner dq-corner--bl"><CornerOrnament /></div>
          <div className="dq-corner dq-corner--br"><CornerOrnament /></div>

          {/* Header */}
          <div className="shrink-0 px-6 pt-4 relative z-10">
            <div className="flex items-center justify-between">
              <p
                className="text-sm font-medium tracking-[0.15em] uppercase"
                style={{ color: 'var(--dq-muted)' }}
              >
                Daily Quote
              </p>
              {state.lastRefreshDate && (
                <p
                  className="text-sm tracking-wide"
                  style={{ color: 'var(--dq-dim)' }}
                >
                  {formatDateNice(state.lastRefreshDate)}
                </p>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex flex-1 flex-col items-center justify-center px-12 py-12 relative z-10">
            {state.quote && !loading ? (
              <QuoteDisplay
                quote={state.quote}
                isStale={isStale}
                loading={loading}
                onRefresh={requestQuote}
              />
            ) : loading ? (
              <LoadingState />
            ) : (
              <EmptyState onGenerate={requestQuote} loading={loading} />
            )}

            {error && (
              <p
                className="mt-4 text-xs font-medium"
                style={{ color: '#e87c6c' }}
              >
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Quote Display ────────────────────────────────────────────

function QuoteDisplay({
  quote,
  isStale,
  loading,
  onRefresh,
}: {
  quote: { text: string; author: string };
  isStale: boolean;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="dq-animate-quote flex w-full max-w-3xl flex-col items-center text-center">
      {/* Quote text with inline decorative marks */}
      <p
        className="dq-quote-text dq-animate-text"
        style={{ color: 'var(--dq-text-soft)' }}
      >
        <span className="dq-quote-mark" style={{ fontSize: '1.6em', marginRight: '0.08em' }} aria-hidden="true">&ldquo;</span>
        {quote.text}
        <span className="dq-quote-mark" style={{ fontSize: '1.6em', marginLeft: '0.08em' }} aria-hidden="true">&rdquo;</span>
      </p>

      {/* Divider */}
      <div className="dq-divider dq-animate-divider" style={{ marginTop: '3.5rem', marginBottom: '2.5rem' }} />

      {/* Author */}
      <p
        className="dq-animate-author text-lg font-medium tracking-[0.14em] uppercase"
        style={{
          color: 'var(--dq-accent)',
          fontFamily: "'Outfit', sans-serif",
        }}
      >
        {quote.author}
      </p>

      {/* Refresh button */}
      <button
        className="dq-button dq-animate-button" style={{ marginTop: '3rem' }}
        onClick={onRefresh}
        disabled={loading}
      >
        <span>{isStale ? 'New quote for today' : 'Get another'}</span>
      </button>
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────

function EmptyState({ onGenerate, loading }: { onGenerate: () => void; loading: boolean }) {
  return (
    <div className="dq-animate-empty flex flex-col items-center text-center">
      {/* Orb */}
      <div className="dq-orb-ring mb-12" />

      {/* Title */}
      <h2
        className="text-3xl font-medium tracking-tight"
        style={{
          color: 'var(--dq-text)',
          fontFamily: "'Playfair Display', Georgia, serif",
        }}
      >
        Your daily inspiration awaits
      </h2>

      {/* Subtitle */}
      <p
        className="mt-6 max-w-[360px] text-lg leading-relaxed"
        style={{ color: 'var(--dq-muted)' }}
      >
        Generate today&rsquo;s quote — something thoughtful to carry with you.
      </p>

      {/* Button */}
      <button
        className="dq-button mt-12"
        onClick={onGenerate}
        disabled={loading}
      >
        <span>Generate today&rsquo;s quote</span>
      </button>
    </div>
  );
}

// ── Loading State ────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="dq-animate-empty flex flex-col items-center text-center">
      {/* Loading dots */}
      <div className="flex gap-3 mb-8">
        <div className="dq-loading-dot" />
        <div className="dq-loading-dot" />
        <div className="dq-loading-dot" />
      </div>

      <p
        className="text-lg font-light tracking-wide"
        style={{ color: 'var(--dq-muted)' }}
      >
        Finding something inspiring…
      </p>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function formatDateNice(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default DailyQuote;
