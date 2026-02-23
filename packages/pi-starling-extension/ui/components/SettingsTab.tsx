/**
 * Settings tab — account management (lock, forget).
 */

import { useState } from 'react';

const CONFIRM_PHRASE = 'FORGET MY ACCOUNT';

export function SettingsTab({
  onLock,
  onForget,
  lastFetchedAt,
}: {
  onLock: () => void;
  onForget: () => void;
  lastFetchedAt: string | null;
}) {
  const [showForget, setShowForget] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  return (
    <div className="sb-animate-in flex flex-col gap-6">
      {/* Lock section */}
      <div className="sb-card p-5">
        <div className="mb-1 text-sm font-medium" style={{ color: 'var(--sb-text)' }}>
          Lock Dashboard
        </div>
        <p className="mb-4 text-xs leading-relaxed" style={{ color: 'var(--sb-muted)' }}>
          Locks the app and returns to the PIN screen. Your token stays
          encrypted — enter your PIN to unlock again.
        </p>
        <button onClick={onLock} className="sb-btn-ghost" style={{ fontSize: 13 }}>
          Lock Now
        </button>
      </div>

      {/* Forget section */}
      <div className="sb-card p-5" style={{ borderColor: 'rgba(248,113,113,0.15)' }}>
        <div className="mb-1 text-sm font-medium" style={{ color: 'var(--sb-danger)' }}>
          Forget Account
        </div>
        <p className="mb-4 text-xs leading-relaxed" style={{ color: 'var(--sb-muted)' }}>
          Permanently deletes your encrypted access token, PIN, and all cached
          data (balance, transactions, savings). You'll need to re-enter your
          Personal Access Token to reconnect.
        </p>

        {!showForget ? (
          <button onClick={() => setShowForget(true)} className="sb-btn-danger" style={{ fontSize: 13 }}>
            Forget Account…
          </button>
        ) : (
          <div className="sb-animate-in">
            <p className="mb-3 text-sm" style={{ color: 'var(--sb-text)' }}>
              Type <strong style={{ color: 'var(--sb-danger)' }}>{CONFIRM_PHRASE}</strong> to confirm:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              className="sb-input mb-3"
              style={{ fontFamily: "'DM Sans', sans-serif", letterSpacing: 0, fontSize: 13 }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowForget(false); setConfirmText(''); }}
                className="sb-btn-ghost" style={{ fontSize: 13 }}
              >Cancel</button>
              <button
                onClick={() => { if (confirmText.trim() === CONFIRM_PHRASE) onForget(); }}
                disabled={confirmText.trim() !== CONFIRM_PHRASE}
                className="sb-btn-danger" style={{ fontSize: 13 }}
              >Forget Everything</button>
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      {lastFetchedAt && (
        <p className="text-center text-xs" style={{ color: 'var(--sb-dim)' }}>
          Data last fetched {new Date(lastFetchedAt).toLocaleString('en-GB')}
        </p>
      )}
    </div>
  );
}
