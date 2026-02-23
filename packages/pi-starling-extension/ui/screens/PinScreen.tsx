/**
 * PinScreen — numeric keypad to unlock encrypted token.
 */

import { useState, useCallback, useEffect } from 'react';
import { ErrorBanner } from './LoginScreen';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;
const MAX_PIN_LEN = 8;

export function PinScreen({
  onUnlock,
  onForget,
  error,
}: {
  onUnlock: (pin: string) => void;
  onForget: () => void;
  error: string | null;
}) {
  const [pin, setPin] = useState('');
  const [showForget, setShowForget] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleKey = useCallback(
    (digit: string) => {
      if (digit === 'clear') { setPin(''); return; }
      if (digit === 'back') { setPin((p) => p.slice(0, -1)); return; }
      setPin((p) => {
        const next = p + digit;
        if (next.length > MAX_PIN_LEN) return p;
        if (next.length >= 4) {
          setTimeout(() => onUnlock(next), 150);
        }
        return next;
      });
    },
    [onUnlock],
  );

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showForget) return; // don't capture when typing confirmation
      if (e.key >= '0' && e.key <= '9') handleKey(e.key);
      else if (e.key === 'Backspace') handleKey('back');
      else if (e.key === 'Escape') handleKey('clear');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleKey, showForget]);

  const confirmPhrase = 'FORGET MY ACCOUNT';
  const canConfirmForget = confirmText.trim() === confirmPhrase;

  if (showForget) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 sb-animate-in">
        <div className="w-full max-w-sm">
          <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--sb-danger)' }}>
            Forget Account
          </h2>
          <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--sb-muted)' }}>
            This will permanently delete your encrypted access token and all cached
            data. You'll need to re-enter your Personal Access Token to reconnect.
          </p>
          <p className="mb-3 text-sm" style={{ color: 'var(--sb-text)' }}>
            Type <strong style={{ color: 'var(--sb-danger)' }}>{confirmPhrase}</strong> to confirm:
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={confirmPhrase}
            className="sb-input mb-4"
            style={{ fontFamily: "'DM Sans', sans-serif", letterSpacing: 0 }}
            autoFocus
          />
          <div className="flex gap-3">
            <button
              onClick={() => { setShowForget(false); setConfirmText(''); }}
              className="sb-btn-ghost flex-1"
            >Cancel</button>
            <button
              onClick={() => { if (canConfirmForget) onForget(); }}
              disabled={!canConfirmForget}
              className="sb-btn-danger flex-1"
            >Forget Everything</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 sb-animate-in">
      {/* Lock icon */}
      <div className="sb-icon-circle mb-6" style={{ width: 64, height: 64 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--sb-accent)' }}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          <circle cx="12" cy="16" r="1" />
        </svg>
      </div>

      <h2 className="mb-1 text-xl font-semibold" style={{ color: 'var(--sb-text)' }}>
        Enter PIN
      </h2>
      <p className="mb-8 text-sm" style={{ color: 'var(--sb-muted)' }}>
        Unlock your Starling Bank dashboard
      </p>

      {/* PIN dots */}
      <div className="mb-8 flex gap-3">
        {Array.from({ length: Math.max(pin.length, 4) }, (_, i) => (
          <div key={i} className={`sb-pin-dot ${i < pin.length ? 'filled' : ''}`} />
        ))}
      </div>

      {/* Number pad — 3 column grid */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {KEYS.map((key) => (
          <button
            key={key}
            onClick={() => handleKey(key)}
            className="sb-pin-key"
            style={{
              fontSize: key === 'clear' || key === 'back' ? 11 : undefined,
              letterSpacing: key === 'clear' || key === 'back' ? 0.5 : undefined,
              textTransform: key === 'clear' || key === 'back' ? 'uppercase' : undefined,
            }}
          >
            {key === 'back' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                <line x1="18" y1="9" x2="12" y2="15" />
                <line x1="12" y1="9" x2="18" y2="15" />
              </svg>
            ) : key === 'clear' ? 'C' : key}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} />}

      <button onClick={() => setShowForget(true)} className="sb-btn-ghost mt-4" style={{ fontSize: 12 }}>
        Forget Account
      </button>
    </div>
  );
}
