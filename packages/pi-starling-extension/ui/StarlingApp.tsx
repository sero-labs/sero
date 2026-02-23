/**
 * StarlingApp — main entry point for the Starling Bank Sero app.
 *
 * Thin router: determines which screen to show based on auth state.
 * The encrypted token persists in state.json across app restarts —
 * only the PIN is needed on subsequent launches.
 *
 * Screens:
 *   LoginScreen  — first-time: enter PAT + set PIN
 *   PinScreen    — returning: enter PIN to decrypt token
 *   Dashboard    — authenticated: balance, transactions, savings
 */

import { useState, useCallback, useEffect } from 'react';
import { useAppState } from '@sero/app-runtime';
import type { StarlingState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { encryptToken, decryptToken, hashPin } from './lib/crypto';
import { fetchAccountHolder } from './lib/api';
import { STYLES } from './styles';
import { LoginScreen } from './screens/LoginScreen';
import { PinScreen } from './screens/PinScreen';
import { Dashboard } from './screens/Dashboard';
import './styles.css';

type Screen = 'login' | 'pin' | 'dashboard';

export function StarlingApp() {
  const [state, updateState] = useAppState<StarlingState>(DEFAULT_STATE);
  const [screen, setScreen] = useState<Screen>('login');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Determine initial screen based on persisted auth
  useEffect(() => {
    if (state.auth.encryptedToken) {
      // Token exists — show PIN screen (unless already unlocked)
      if (screen !== 'dashboard') setScreen('pin');
    } else {
      setScreen('login');
    }
  }, [state.auth.encryptedToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle first-time login: verify token, encrypt, store
  const handleLogin = useCallback(
    async (accessToken: string, pin: string) => {
      setError(null);
      setLoading(true);
      try {
        await fetchAccountHolder(accessToken);
        const { encrypted, salt, iv } = await encryptToken(accessToken, pin);
        const pinH = await hashPin(pin);
        updateState((prev) => ({
          ...prev,
          auth: { encryptedToken: encrypted, salt, iv, pinHash: pinH },
        }));
        setToken(accessToken);
        setScreen('dashboard');
      } catch (err: unknown) {
        const detail = err instanceof Error && 'detail' in err
          ? (err as { detail: string }).detail
          : 'Failed to verify token. Please check your access token.';
        setError(detail);
      } finally {
        setLoading(false);
      }
    },
    [updateState],
  );

  // Handle returning unlock: decrypt token with PIN
  const handlePinUnlock = useCallback(
    async (pin: string) => {
      setError(null);
      try {
        const pinH = await hashPin(pin);
        if (pinH !== state.auth.pinHash) {
          setError('Incorrect PIN. Please try again.');
          return;
        }
        const decrypted = await decryptToken(
          state.auth.encryptedToken!,
          state.auth.salt!,
          state.auth.iv!,
          pin,
        );
        setToken(decrypted);
        setScreen('dashboard');
      } catch {
        setError('Failed to decrypt token. PIN may be incorrect.');
      }
    },
    [state.auth],
  );

  // Lock: clear in-memory token, keep encrypted token in state
  const handleLock = useCallback(() => {
    setToken(null);
    setScreen('pin');
    setError(null);
  }, []);

  // Forget: permanently clear all data (token + cache)
  const handleForget = useCallback(() => {
    updateState(() => ({ ...DEFAULT_STATE }));
    setToken(null);
    setScreen('login');
    setError(null);
  }, [updateState]);

  return (
    <>
      <style>{STYLES}</style>
      <div className="sb-root flex h-full w-full flex-col overflow-hidden" style={{ background: 'var(--sb-bg)' }}>
        {screen === 'login' && (
          <LoginScreen onLogin={handleLogin} error={error} loading={loading} />
        )}
        {screen === 'pin' && (
          <PinScreen onUnlock={handlePinUnlock} onForget={handleForget} error={error} />
        )}
        {screen === 'dashboard' && token && (
          <Dashboard
            token={token}
            state={state}
            updateState={updateState}
            onLock={handleLock}
            onForget={handleForget}
          />
        )}
      </div>
    </>
  );
}

export default StarlingApp;
