/**
 * StarlingApp — main entry point for the Starling Bank Sero app.
 *
 * Thin router: determines which screen to show based on auth state.
 *
 * Security model:
 *   - Token encrypted via Electron safeStorage (OS Keychain).
 *     Only this app, on this machine, by this OS user can decrypt.
 *   - PIN is a UX-level lock (prevents casual access), not the
 *     encryption key. Salted hash stored for quick verification.
 *
 * Screens:
 *   LoginScreen  — first-time: enter PAT + set PIN
 *   PinScreen    — returning: enter PIN to unlock
 *   Dashboard    — authenticated: balance, transactions, savings
 */

import { useState, useCallback, useEffect } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import type { StarlingState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { encryptToken, decryptToken, hashPin, generatePinSalt } from './lib/crypto';
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
      if (screen !== 'dashboard') setScreen('pin');
    } else {
      setScreen('login');
    }
  }, [state.auth.encryptedToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // First-time login: verify token, encrypt via safeStorage, store
  const handleLogin = useCallback(
    async (accessToken: string, pin: string) => {
      setError(null);
      setLoading(true);
      try {
        await fetchAccountHolder(accessToken);
        const encrypted = await encryptToken(accessToken);
        const pinSalt = generatePinSalt();
        const pinH = await hashPin(pin, pinSalt);
        updateState((prev) => ({
          ...prev,
          auth: { encryptedToken: encrypted, pinHash: pinH, pinSalt },
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

  // Returning unlock: verify PIN hash, then decrypt via safeStorage
  const handlePinUnlock = useCallback(
    async (pin: string) => {
      setError(null);
      try {
        const pinH = await hashPin(pin, state.auth.pinSalt!);
        if (pinH !== state.auth.pinHash) {
          setError('Incorrect PIN. Please try again.');
          return;
        }
        const decrypted = await decryptToken(state.auth.encryptedToken!);
        setToken(decrypted);
        setScreen('dashboard');
      } catch {
        setError('Failed to decrypt token. Please try again or forget this account.');
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
