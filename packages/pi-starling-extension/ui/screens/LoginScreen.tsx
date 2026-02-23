/**
 * LoginScreen — PAT input + PIN setup (first-time connect only).
 */

import { useState } from 'react';

export function LoginScreen({
  onLogin,
  error,
  loading,
}: {
  onLogin: (token: string, pin: string) => void;
  error: string | null;
  loading: boolean;
}) {
  const [tokenInput, setTokenInput] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [step, setStep] = useState<'token' | 'pin'>('token');
  const [showToken, setShowToken] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleTokenSubmit = () => {
    if (!tokenInput.trim()) return;
    setStep('pin');
    setLocalError(null);
  };

  const handlePinSubmit = () => {
    if (pin.length < 4) {
      setLocalError('PIN must be at least 4 digits.');
      return;
    }
    if (pin !== pinConfirm) {
      setLocalError('PINs do not match.');
      return;
    }
    setLocalError(null);
    onLogin(tokenInput.trim(), pin);
  };

  const displayError = error || localError;

  return (
    <div className="flex flex-1 items-center justify-center p-6 sb-animate-in">
      <div className="w-full max-w-md">
        {/* Icon */}
        <div className="mb-8 flex justify-center">
          <div className="sb-icon-circle">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--sb-accent)' }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="9" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="15" />
              <line x1="9" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="15" y2="12" />
            </svg>
          </div>
        </div>

        <h1 className="mb-2 text-center text-2xl font-semibold" style={{ color: 'var(--sb-text)' }}>
          Starling Bank
        </h1>
        <p className="mb-8 text-center text-sm" style={{ color: 'var(--sb-muted)' }}>
          {step === 'token'
            ? 'Enter your personal access token to connect.'
            : 'Set a PIN to protect your token.'}
        </p>

        <div className="sb-card-embossed">
          {step === 'token' ? (
            <div>
              <label className="sb-stat-label mb-2 block">Personal Access Token</label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="eyJhbGciOiJQUzI1NiIs..."
                  className="sb-input pr-12"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleTokenSubmit()}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--sb-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
                  }}
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--sb-dim)' }}>
                Create a token at{' '}
                <span style={{ color: 'var(--sb-accent)' }}>developer.starlingbank.com</span>
                {' '}with account:read, balance:read, and transaction:read scopes.
              </p>
              <div className="mt-6">
                <button onClick={handleTokenSubmit} disabled={!tokenInput.trim()} className="sb-btn w-full">
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="sb-stat-label mb-2 block">Set a PIN (min 4 digits)</label>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="Enter PIN"
                className="sb-input mb-3"
                style={{ textAlign: 'center', letterSpacing: 8, fontSize: 18 }}
                autoFocus
              />
              <label className="sb-stat-label mb-2 block">Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="Confirm PIN"
                className="sb-input"
                style={{ textAlign: 'center', letterSpacing: 8, fontSize: 18 }}
                onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
              />
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => { setStep('token'); setPin(''); setPinConfirm(''); setLocalError(null); }}
                  className="sb-btn-ghost flex-1"
                >Back</button>
                <button onClick={handlePinSubmit} disabled={pin.length < 4 || loading} className="sb-btn flex-1">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="sb-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                      Verifying…
                    </span>
                  ) : 'Connect'}
                </button>
              </div>
            </div>
          )}
        </div>

        {displayError && <ErrorBanner message={displayError} />}
      </div>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="sb-error-banner sb-animate-in mt-4">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div style={{ whiteSpace: 'pre-line' }}>{message}</div>
    </div>
  );
}
