/**
 * DailyQuote — main Sero web UI for the daily quote extension.
 *
 * Displays a daily inspirational quote in a clean, indigo-accented card.
 * Uses useAI to generate quotes via the app's dedicated agent session —
 * no active chat session required.
 *
 * Design: minimal, contemplative — indigo/purple accents matching the
 * weight tracker, centred quote with generous whitespace.
 */

import { useMemo, useCallback, useState } from 'react';
import { useAppState, useAI } from '@sero/app-runtime';
import type { DailyQuoteState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

// ── Styles ───────────────────────────────────────────────────

const CUSTOM_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300;1,9..40,400&family=Instrument+Serif:ital@0;1&display=swap');

  .dq-root {
    --dq-bg: #0f1117;
    --dq-bg-surface: #191b23;
    --dq-bg-elevated: #22252f;
    --dq-text: #e8e4df;
    --dq-muted: #8b8d97;
    --dq-dim: #5c5e6a;
    --dq-accent: #818cf8;
    --dq-accent-hover: #a5b4fc;
    --dq-accent-glow: rgba(129, 140, 248, 0.12);
    --dq-border: rgba(255, 255, 255, 0.07);

    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    background: var(--dq-bg);
    color: var(--dq-text);
  }

  @supports (color: var(--bg-base)) {
    .dq-root {
      --dq-bg: var(--bg-base, #0f1117);
      --dq-bg-surface: var(--bg-surface, #191b23);
      --dq-bg-elevated: var(--bg-elevated, #22252f);
      --dq-text: var(--text-primary, #e8e4df);
      --dq-border: var(--border, rgba(255, 255, 255, 0.07));
    }
  }

  .dq-card {
    background: var(--dq-bg-surface);
    border: 1px solid var(--dq-border);
    border-radius: 12px;
    width: 100%;
  }

  .dq-quote-text {
    font-family: 'Instrument Serif', Georgia, serif;
    font-weight: 400;
    font-style: italic;
    line-height: 1.6;
  }

  .dq-button {
    background: var(--dq-accent);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    padding: 8px 20px;
    font-size: 13px;
    font-weight: 500;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    transition: all 0.15s;
  }
  .dq-button:hover:not(:disabled) {
    background: var(--dq-accent-hover);
    box-shadow: 0 0 20px var(--dq-accent-glow);
  }
  .dq-button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .dq-orb {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 40%, var(--dq-accent) 0%, transparent 70%);
    opacity: 0.12;
    animation: dq-pulse 4s ease-in-out infinite;
  }

  @keyframes dq-pulse {
    0%, 100% { transform: scale(1); opacity: 0.12; }
    50% { transform: scale(1.08); opacity: 0.2; }
  }

  @keyframes dq-fade-in {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .dq-animate-in {
    animation: dq-fade-in 0.5s ease-out both;
  }

  .dq-spin {
    animation: dq-spinner 1s linear infinite;
  }

  @keyframes dq-spinner {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

// ── Quote parsing ────────────────────────────────────────────

function parseQuoteResponse(response: string): { text: string; author: string } | null {
  // Try to parse structured formats first:
  // "quote text" — Author
  // "quote text" - Author
  const quoteMatch = response.match(/["""](.+?)["""]\s*[—–-]\s*(.+?)$/ms);
  if (quoteMatch) {
    return { text: quoteMatch[1].trim(), author: quoteMatch[2].trim() };
  }

  // Try: QUOTE: ... AUTHOR: ...
  const labelMatch = response.match(/QUOTE:\s*(.+?)\s*AUTHOR:\s*(.+)/si);
  if (labelMatch) {
    return { text: labelMatch[1].trim().replace(/^[""]|[""]$/g, ''), author: labelMatch[2].trim() };
  }

  // Fallback: split on last dash/em-dash line
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
      <div className="dq-root flex h-full w-full flex-col overflow-hidden p-2">
        <div className="dq-card flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="shrink-0 px-6 pb-2 pt-5">
            <div className="flex items-baseline justify-between">
              <h1
                className="text-xl font-medium tracking-tight"
                style={{ color: 'var(--dq-text)', fontFamily: "'DM Sans', system-ui, sans-serif" }}
              >
                Daily Quote
              </h1>
              {state.lastRefreshDate && (
                <span className="text-sm" style={{ color: 'var(--dq-muted)' }}>
                  {formatDateNice(state.lastRefreshDate)}
                </span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
            {state.quote && !loading ? (
              <div className="dq-animate-in flex max-w-md flex-col items-center text-center">
                {/* Quote mark */}
                <div
                  className="mb-4 text-4xl font-light leading-none"
                  style={{ color: 'var(--dq-accent)', opacity: 0.4 }}
                >
                  &ldquo;
                </div>

                {/* Quote text */}
                <p
                  className="dq-quote-text text-lg"
                  style={{ color: 'var(--dq-text)' }}
                >
                  {state.quote.text}
                </p>

                {/* Author */}
                <p
                  className="mt-4 text-sm font-medium tracking-wide"
                  style={{ color: 'var(--dq-accent)' }}
                >
                  — {state.quote.author}
                </p>

                {/* Refresh button */}
                <button
                  className="dq-button mt-8"
                  onClick={requestQuote}
                  disabled={loading}
                >
                  {isStale ? 'New quote for today' : 'Get another'}
                </button>
              </div>
            ) : loading ? (
              <LoadingState />
            ) : (
              <EmptyState onGenerate={requestQuote} loading={loading} />
            )}

            {error && (
              <p className="mt-3 text-xs" style={{ color: '#f87171' }}>
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Empty State ──────────────────────────────────────────────

function EmptyState({ onGenerate, loading }: { onGenerate: () => void; loading: boolean }) {
  return (
    <div className="dq-animate-in flex flex-col items-center text-center">
      <div className="dq-orb mb-6" />
      <h2
        className="text-lg font-medium"
        style={{ color: 'var(--dq-text)', fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        Your daily inspiration awaits
      </h2>
      <p
        className="mt-2 max-w-[260px] text-lg leading-relaxed"
        style={{ color: 'var(--dq-muted)' }}
      >
        Tap below to generate today&rsquo;s quote — something thoughtful to carry with you.
      </p>
      <button
        className="dq-button mt-6"
        onClick={onGenerate}
        disabled={loading}
      >
        Generate today&rsquo;s quote
      </button>
    </div>
  );
}

// ── Loading State ────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="dq-animate-in flex flex-col items-center text-center">
      <svg
        className="dq-spin mb-4"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--dq-accent)"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
      <p className="text-sm" style={{ color: 'var(--dq-muted)' }}>
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
