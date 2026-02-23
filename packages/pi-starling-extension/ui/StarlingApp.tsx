/**
 * StarlingApp — Sero web UI for the Starling Bank extension.
 *
 * Uses useAppState from @sero/app-runtime to read/write the same
 * state.json file the Pi extension writes.
 *
 * Features:
 * - PIN-based AES-GCM encryption of access token
 * - Rate-limit-aware API client with exponential backoff
 * - Skeuomorphic banking dashboard design
 * - Balance overview, transaction feed, spending charts, savings goals
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useAppState } from '@sero/app-runtime';
import type {
  StarlingState,
  StarlingAccount,
  StarlingBalance,
  StarlingFeedItem,
  StarlingAccountHolder,
  StarlingSavingsGoal,
} from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

// ═══════════════════════════════════════════════════════════════
// CRYPTO UTILITIES — AES-GCM token encryption with PIN
// ═══════════════════════════════════════════════════════════════

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptToken(token: string, pin: string): Promise<{ encrypted: string; salt: string; iv: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(token),
  );
  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

async function decryptToken(encrypted: string, salt: string, iv: string, pin: string): Promise<string> {
  const saltBytes = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const cipherBytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const key = await deriveKey(pin, saltBytes);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    cipherBytes,
  );
  return new TextDecoder().decode(plaintext);
}

async function hashPin(pin: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(pin));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ═══════════════════════════════════════════════════════════════
// API CLIENT — Rate-limit-aware with exponential backoff
// ═══════════════════════════════════════════════════════════════

const API_BASE = 'https://api.starlingbank.com/api/v2';
const MAX_RETRIES = 4;
const INITIAL_BACKOFF_MS = 1000;

interface ApiError {
  status: number;
  message: string;
  retryAfter?: number;
}

class StarlingApiError extends Error {
  status: number;
  retryAfter?: number;
  detail: string;

  constructor(status: number, message: string, detail: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.detail = detail;
    this.retryAfter = retryAfter;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiFetch<T>(
  path: string,
  token: string,
  params?: Record<string, string>,
): Promise<T> {
  let url = `${API_BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    url += `?${qs}`;
  }

  let lastError: StarlingApiError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = lastError?.retryAfter
        ? lastError.retryAfter * 1000
        : INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      await sleep(backoff);
    }

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'User-Agent': 'SeroStarlingApp/1.0',
        },
      });
    } catch (err) {
      lastError = new StarlingApiError(
        0,
        'Network error',
        err instanceof Error ? err.message : 'Failed to connect to Starling Bank API. Check your internet connection.',
      );
      continue;
    }

    // Success
    if (res.ok) {
      return (await res.json()) as T;
    }

    // Rate limited — extract Retry-After header
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10) || undefined;
      lastError = new StarlingApiError(
        429,
        'Rate limited',
        `Rate limited by Starling Bank API. ${retryAfter ? `Retry after ${retryAfter}s.` : 'Backing off...'} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
        retryAfter,
      );
      continue;
    }

    // Auth errors — do not retry
    if (res.status === 401) {
      throw new StarlingApiError(401, 'Unauthorized', 'Your access token is invalid or expired. Please log out and re-enter a valid token.');
    }
    if (res.status === 403) {
      let detail = 'Your token does not have permission for this request.';
      try {
        const body = await res.json();
        if (body?.error_description || body?.message) {
          detail = body.error_description || body.message;
        }
      } catch { /* ignore parse errors */ }
      throw new StarlingApiError(403, 'Forbidden', detail);
    }

    // Server errors — retry with backoff
    if (res.status >= 500) {
      let detail = `Starling Bank API returned ${res.status}.`;
      try {
        const body = await res.json();
        if (body?.message) detail = body.message;
      } catch { /* ignore parse errors */ }
      lastError = new StarlingApiError(res.status, 'Server error', `${detail} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
      continue;
    }

    // Other client errors — do not retry
    let detail = `API request failed with status ${res.status}.`;
    try {
      const body = await res.json();
      if (body?.message || body?.error) {
        detail = body.message || body.error;
      }
    } catch { /* ignore */ }
    throw new StarlingApiError(res.status, 'Request failed', detail);
  }

  // All retries exhausted
  throw lastError || new StarlingApiError(0, 'Request failed', 'All retry attempts exhausted.');
}

// ── API convenience wrappers ──────────────────────────────────

async function fetchAccounts(token: string) {
  const res = await apiFetch<{ accounts: StarlingAccount[] }>('/accounts', token);
  return res.accounts;
}

async function fetchBalance(token: string, accountUid: string) {
  return apiFetch<StarlingBalance>(`/accounts/${accountUid}/balance`, token);
}

async function fetchAccountHolder(token: string) {
  return apiFetch<StarlingAccountHolder>('/account-holder', token);
}

async function fetchTransactions(token: string, accountUid: string, categoryUid: string, since?: string) {
  const params: Record<string, string> = {};
  if (since) params.changesSince = since;
  const res = await apiFetch<{ feedItems: StarlingFeedItem[] }>(
    `/feed/account/${accountUid}/category/${categoryUid}`,
    token,
    params,
  );
  return res.feedItems;
}

async function fetchSavingsGoals(token: string, accountUid: string) {
  const res = await apiFetch<{ savingsGoalList: StarlingSavingsGoal[] }>(
    `/account/${accountUid}/savings-goals`,
    token,
  );
  return res.savingsGoalList || [];
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function formatMoney(minorUnits: number, currency: string = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(minorUnits / 100);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    EATING_OUT: '#e67e22',
    GROCERIES: '#27ae60',
    TRANSPORT: '#3498db',
    SHOPPING: '#9b59b6',
    ENTERTAINMENT: '#e74c3c',
    BILLS_AND_SERVICES: '#f39c12',
    GENERAL: '#95a5a6',
    INCOME: '#2ecc71',
    SAVINGS: '#1abc9c',
    TRANSFERS: '#34495e',
    PAYMENTS: '#7f8c8d',
    HOUSING: '#d35400',
    PERSONAL_CARE: '#c0392b',
    FAMILY: '#8e44ad',
    HOLIDAYS: '#16a085',
    CHARITY: '#2980b9',
    NONE: '#bdc3c7',
  };
  return colors[category] || '#95a5a6';
}

function friendlyCategory(category: string): string {
  return category
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ═══════════════════════════════════════════════════════════════
// SKEUOMORPHIC STYLES
// ═══════════════════════════════════════════════════════════════

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,300;1,9..40,400&family=DM+Mono:wght@300;400;500&display=swap');

  .sb-root {
    --sb-leather: #1e1710;
    --sb-leather-light: #2a2018;
    --sb-felt: #1a2e1a;
    --sb-felt-light: #243824;
    --sb-brass: #c8a44e;
    --sb-brass-light: #dbb960;
    --sb-brass-dim: #8a7235;
    --sb-gold: #d4a843;
    --sb-cream: #f5f0e4;
    --sb-cream-dim: #d4cbb5;
    --sb-parchment: #ebe3d0;
    --sb-ink: #1c1612;
    --sb-ink-light: #3d332a;
    --sb-red: #c0392b;
    --sb-green: #2d7a4f;
    --sb-green-light: #38925f;
    --sb-shadow: rgba(0,0,0,0.5);
    --sb-highlight: rgba(255,255,255,0.06);
    --sb-card-bg: linear-gradient(145deg, #2a2018 0%, #1e1710 100%);
    --sb-surface: #241c14;

    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    background:
      radial-gradient(ellipse at 20% 50%, rgba(42,32,24,0.8) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 50%, rgba(42,32,24,0.6) 0%, transparent 60%),
      repeating-linear-gradient(
        90deg,
        transparent,
        transparent 2px,
        rgba(255,255,255,0.003) 2px,
        rgba(255,255,255,0.003) 4px
      ),
      linear-gradient(180deg, #181010 0%, #120e08 50%, #0e0a06 100%);
    color: var(--sb-cream);
    min-height: 100%;
  }

  .sb-root * { box-sizing: border-box; }

  .sb-card {
    background: var(--sb-card-bg);
    border: 1px solid rgba(200,164,78,0.12);
    border-radius: 12px;
    box-shadow:
      0 2px 8px rgba(0,0,0,0.4),
      0 1px 0 rgba(255,255,255,0.04) inset,
      0 -1px 0 rgba(0,0,0,0.3) inset;
    position: relative;
    overflow: hidden;
  }
  .sb-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      repeating-linear-gradient(
        0deg,
        transparent,
        transparent 1px,
        rgba(255,255,255,0.008) 1px,
        rgba(255,255,255,0.008) 2px
      );
    pointer-events: none;
    border-radius: 12px;
  }

  .sb-card-embossed {
    background: linear-gradient(160deg, #2e2418 0%, #221a12 50%, #1a140e 100%);
    border: 1px solid rgba(200,164,78,0.15);
    border-radius: 14px;
    box-shadow:
      0 4px 16px rgba(0,0,0,0.5),
      0 1px 0 rgba(255,255,255,0.06) inset;
    padding: 20px;
  }

  .sb-brass-rule {
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, var(--sb-brass-dim) 20%, var(--sb-brass) 50%, var(--sb-brass-dim) 80%, transparent 100%);
    opacity: 0.4;
    border: none;
    margin: 12px 0;
  }

  .sb-input {
    background: linear-gradient(180deg, #161008 0%, #1e160e 100%);
    border: 1px solid rgba(200,164,78,0.2);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 14px;
    color: var(--sb-cream);
    font-family: 'DM Mono', 'DM Sans', monospace;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-shadow:
      0 2px 4px rgba(0,0,0,0.3) inset,
      0 1px 0 rgba(255,255,255,0.03);
    width: 100%;
    letter-spacing: 0.5px;
  }
  .sb-input::placeholder { color: rgba(212,203,181,0.3); }
  .sb-input:focus {
    border-color: var(--sb-brass);
    box-shadow:
      0 2px 4px rgba(0,0,0,0.3) inset,
      0 0 0 2px rgba(200,164,78,0.15);
  }

  .sb-btn {
    background: linear-gradient(180deg, #d4a843 0%, #b8912e 50%, #a07d28 100%);
    color: #1a1208;
    border: 1px solid rgba(212,168,67,0.6);
    border-radius: 8px;
    padding: 10px 24px;
    font-size: 14px;
    font-weight: 600;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    transition: all 0.15s;
    box-shadow:
      0 2px 6px rgba(0,0,0,0.4),
      0 1px 0 rgba(255,255,255,0.2) inset;
    text-shadow: 0 1px 0 rgba(255,255,255,0.15);
    letter-spacing: 0.3px;
  }
  .sb-btn:hover:not(:disabled) {
    background: linear-gradient(180deg, #dbb960 0%, #c8a44e 50%, #b0913a 100%);
    box-shadow:
      0 3px 10px rgba(200,164,78,0.3),
      0 1px 0 rgba(255,255,255,0.25) inset;
  }
  .sb-btn:active:not(:disabled) {
    background: linear-gradient(180deg, #a07d28 0%, #b8912e 100%);
    box-shadow:
      0 1px 2px rgba(0,0,0,0.5) inset;
    transform: translateY(1px);
  }
  .sb-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .sb-btn-ghost {
    background: transparent;
    color: var(--sb-brass);
    border: 1px solid rgba(200,164,78,0.25);
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    transition: all 0.15s;
  }
  .sb-btn-ghost:hover {
    background: rgba(200,164,78,0.08);
    border-color: rgba(200,164,78,0.4);
  }

  .sb-pin-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid var(--sb-brass-dim);
    background: transparent;
    transition: all 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3) inset;
  }
  .sb-pin-dot.filled {
    background: var(--sb-brass);
    border-color: var(--sb-brass);
    box-shadow:
      0 0 8px rgba(200,164,78,0.3),
      0 1px 2px rgba(0,0,0,0.2) inset;
  }

  .sb-pin-key {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: linear-gradient(180deg, #2e2418 0%, #221a12 100%);
    border: 1px solid rgba(200,164,78,0.2);
    color: var(--sb-cream);
    font-size: 20px;
    font-weight: 500;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.1s;
    box-shadow:
      0 3px 8px rgba(0,0,0,0.4),
      0 1px 0 rgba(255,255,255,0.06) inset;
  }
  .sb-pin-key:hover {
    background: linear-gradient(180deg, #3a2e20 0%, #2a2018 100%);
    border-color: rgba(200,164,78,0.35);
  }
  .sb-pin-key:active {
    background: linear-gradient(180deg, #1a140e 0%, #221a12 100%);
    box-shadow: 0 1px 3px rgba(0,0,0,0.5) inset;
    transform: translateY(1px);
  }

  .sb-tx-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-radius: 8px;
    transition: background 0.12s;
  }
  .sb-tx-row:hover {
    background: rgba(255,255,255,0.03);
  }

  .sb-ledger-line {
    border-bottom: 1px solid rgba(200,164,78,0.06);
  }
  .sb-ledger-line:last-child {
    border-bottom: none;
  }

  .sb-stat-label {
    font-size: 11px;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--sb-brass-dim);
    font-weight: 500;
  }

  .sb-mono {
    font-family: 'DM Mono', 'SF Mono', monospace;
    letter-spacing: 0.5px;
  }

  .sb-glow-green {
    text-shadow: 0 0 20px rgba(45,122,79,0.4);
  }

  .sb-error-banner {
    background: linear-gradient(180deg, rgba(192,57,43,0.15) 0%, rgba(192,57,43,0.08) 100%);
    border: 1px solid rgba(192,57,43,0.3);
    border-radius: 8px;
    padding: 12px 16px;
    color: #e8b4ae;
    font-size: 13px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .sb-info-banner {
    background: linear-gradient(180deg, rgba(200,164,78,0.1) 0%, rgba(200,164,78,0.04) 100%);
    border: 1px solid rgba(200,164,78,0.2);
    border-radius: 8px;
    padding: 12px 16px;
    color: var(--sb-cream-dim);
    font-size: 13px;
  }

  .sb-progress-track {
    height: 8px;
    border-radius: 4px;
    background: linear-gradient(180deg, #161008 0%, #1e160e 100%);
    box-shadow: 0 1px 3px rgba(0,0,0,0.3) inset;
    overflow: hidden;
  }
  .sb-progress-fill {
    height: 100%;
    border-radius: 4px;
    background: linear-gradient(90deg, var(--sb-brass-dim) 0%, var(--sb-brass) 100%);
    box-shadow: 0 0 6px rgba(200,164,78,0.3);
    transition: width 0.5s ease;
  }

  .sb-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(200,164,78,0.2);
    border-top-color: var(--sb-brass);
    border-radius: 50%;
    animation: sb-spin 0.8s linear infinite;
  }
  @keyframes sb-spin {
    to { transform: rotate(360deg); }
  }

  @keyframes sb-fade-in {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .sb-animate-in {
    animation: sb-fade-in 0.4s ease-out both;
  }

  .sb-scrollable::-webkit-scrollbar {
    width: 6px;
  }
  .sb-scrollable::-webkit-scrollbar-track {
    background: transparent;
  }
  .sb-scrollable::-webkit-scrollbar-thumb {
    background: rgba(200,164,78,0.15);
    border-radius: 3px;
  }
  .sb-scrollable::-webkit-scrollbar-thumb:hover {
    background: rgba(200,164,78,0.25);
  }

  .sb-vault-icon {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 35% 35%, rgba(219,185,96,0.3) 0%, transparent 50%),
      linear-gradient(145deg, #2e2418 0%, #1a140e 100%);
    border: 2px solid rgba(200,164,78,0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      0 4px 16px rgba(0,0,0,0.5),
      0 1px 0 rgba(255,255,255,0.08) inset;
  }

  .sb-tab {
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--sb-cream-dim);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.15s;
    border-bottom: 2px solid transparent;
    font-family: 'DM Sans', sans-serif;
  }
  .sb-tab:hover { color: var(--sb-cream); }
  .sb-tab.active {
    color: var(--sb-brass);
    border-bottom-color: var(--sb-brass);
  }
`;

// ═══════════════════════════════════════════════════════════════
// MAIN APP COMPONENT
// ═══════════════════════════════════════════════════════════════

type Screen = 'login' | 'pin' | 'dashboard';

export function StarlingApp() {
  const [state, updateState] = useAppState<StarlingState>(DEFAULT_STATE);
  const [screen, setScreen] = useState<Screen>('login');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Determine initial screen
  useEffect(() => {
    if (state.auth.encryptedToken) {
      setScreen('pin');
    } else {
      setScreen('login');
    }
  }, [state.auth.encryptedToken]);

  // Reset screen when token is cleared
  useEffect(() => {
    if (!state.auth.encryptedToken && screen === 'dashboard') {
      setToken(null);
      setScreen('login');
    }
  }, [state.auth.encryptedToken, screen]);

  const handleLogin = useCallback(
    async (accessToken: string, pin: string) => {
      setError(null);
      setLoading(true);
      try {
        // Verify token works by fetching account holder
        await fetchAccountHolder(accessToken);

        // Encrypt and store
        const { encrypted, salt, iv } = await encryptToken(accessToken, pin);
        const pinH = await hashPin(pin);
        updateState((prev) => ({
          ...prev,
          auth: { encryptedToken: encrypted, salt, iv, pinHash: pinH },
        }));
        setToken(accessToken);
        setScreen('dashboard');
      } catch (err) {
        if (err instanceof StarlingApiError) {
          setError(err.detail);
        } else {
          setError('Failed to verify token. Please check your access token and try again.');
        }
      } finally {
        setLoading(false);
      }
    },
    [updateState],
  );

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

  const handleLogout = useCallback(() => {
    updateState(() => ({ ...DEFAULT_STATE }));
    setToken(null);
    setScreen('login');
    setError(null);
  }, [updateState]);

  return (
    <>
      <style>{STYLES}</style>
      <div className="sb-root flex h-full w-full flex-col overflow-hidden">
        {screen === 'login' && (
          <LoginScreen onLogin={handleLogin} error={error} loading={loading} />
        )}
        {screen === 'pin' && (
          <PinScreen onUnlock={handlePinUnlock} onLogout={handleLogout} error={error} />
        )}
        {screen === 'dashboard' && token && (
          <Dashboard
            token={token}
            state={state}
            updateState={updateState}
            onLogout={handleLogout}
          />
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOGIN SCREEN
// ═══════════════════════════════════════════════════════════════

function LoginScreen({
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
        {/* Vault icon */}
        <div className="flex justify-center mb-8">
          <div className="sb-vault-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--sb-brass)' }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="9" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="15" />
              <line x1="9" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="15" y2="12" />
            </svg>
          </div>
        </div>

        <h1
          className="text-center text-2xl font-semibold mb-2"
          style={{ color: 'var(--sb-cream)', letterSpacing: '-0.3px' }}
        >
          Starling Bank
        </h1>
        <p className="text-center text-sm mb-8" style={{ color: 'var(--sb-cream-dim)' }}>
          {step === 'token'
            ? 'Enter your personal access token to connect.'
            : 'Set a PIN to protect your token.'}
        </p>

        <div className="sb-card-embossed">
          {step === 'token' ? (
            <div>
              <label className="sb-stat-label block mb-2">Personal Access Token</label>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--sb-brass-dim)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="mt-3 text-xs leading-relaxed" style={{ color: 'rgba(212,203,181,0.4)' }}>
                Create a token at{' '}
                <span style={{ color: 'var(--sb-brass-dim)' }}>developer.starlingbank.com</span>
                {' '}with account:read, balance:read, and transaction:read scopes.
              </p>

              <div className="mt-6">
                <button
                  onClick={handleTokenSubmit}
                  disabled={!tokenInput.trim()}
                  className="sb-btn w-full"
                >
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="sb-stat-label block mb-2">Set a PIN (min 4 digits)</label>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="Enter PIN"
                className="sb-input mb-3"
                style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '18px' }}
                autoFocus
              />

              <label className="sb-stat-label block mb-2">Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="Confirm PIN"
                className="sb-input"
                style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '18px' }}
                onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
              />

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => { setStep('token'); setPin(''); setPinConfirm(''); setLocalError(null); }}
                  className="sb-btn-ghost flex-1"
                >
                  Back
                </button>
                <button
                  onClick={handlePinSubmit}
                  disabled={pin.length < 4 || loading}
                  className="sb-btn flex-1"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="sb-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                      Verifying...
                    </span>
                  ) : (
                    'Connect'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {displayError && (
          <div className="sb-error-banner mt-4 sb-animate-in">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{displayError}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PIN ENTRY SCREEN
// ═══════════════════════════════════════════════════════════════

function PinScreen({
  onUnlock,
  onLogout,
  error,
}: {
  onUnlock: (pin: string) => void;
  onLogout: () => void;
  error: string | null;
}) {
  const [pin, setPin] = useState('');
  const maxLen = 8;

  const handleKey = useCallback(
    (digit: string) => {
      if (digit === 'clear') {
        setPin('');
        return;
      }
      if (digit === 'back') {
        setPin((p) => p.slice(0, -1));
        return;
      }
      setPin((p) => {
        const next = p + digit;
        if (next.length > maxLen) return p;
        if (next.length >= 4) {
          // Auto-submit after small delay for visual feedback
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
      if (e.key >= '0' && e.key <= '9') handleKey(e.key);
      else if (e.key === 'Backspace') handleKey('back');
      else if (e.key === 'Escape') handleKey('clear');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleKey]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 sb-animate-in">
      {/* Lock icon */}
      <div className="sb-vault-icon mb-6">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--sb-brass)' }}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          <circle cx="12" cy="16" r="1" />
        </svg>
      </div>

      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--sb-cream)' }}>
        Enter PIN
      </h2>
      <p className="text-sm mb-8" style={{ color: 'var(--sb-cream-dim)' }}>
        Unlock your Starling Bank dashboard
      </p>

      {/* PIN dots */}
      <div className="flex gap-3 mb-8">
        {Array.from({ length: Math.max(pin.length, 4) }, (_, i) => (
          <div key={i} className={`sb-pin-dot ${i < pin.length ? 'filled' : ''}`} />
        ))}
      </div>

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'].map((key) => (
          <button
            key={key}
            onClick={() => handleKey(key)}
            className="sb-pin-key"
            style={{
              fontSize: key === 'clear' || key === 'back' ? '11px' : undefined,
              letterSpacing: key === 'clear' || key === 'back' ? '0.5px' : undefined,
              textTransform: key === 'clear' || key === 'back' ? 'uppercase' : undefined,
            }}
          >
            {key === 'back' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                <line x1="18" y1="9" x2="12" y2="15" />
                <line x1="12" y1="9" x2="18" y2="15" />
              </svg>
            ) : key === 'clear' ? (
              'C'
            ) : (
              key
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="sb-error-banner mb-4 sb-animate-in" style={{ maxWidth: 280 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <button onClick={onLogout} className="sb-btn-ghost mt-2" style={{ fontSize: 12 }}>
        Disconnect Account
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════

type DashTab = 'overview' | 'transactions' | 'savings';

function Dashboard({
  token,
  state,
  updateState,
  onLogout,
}: {
  token: string;
  state: StarlingState;
  updateState: (updater: (prev: StarlingState) => StarlingState) => void;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<DashTab>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryInfo, setRetryInfo] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const refreshData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    setRetryInfo(null);

    try {
      // Fetch accounts first
      const accounts = await fetchAccounts(token);
      if (!accounts || accounts.length === 0) {
        setError('No accounts found. Please check your token permissions.');
        return;
      }

      const account = accounts[0];
      const accountUid = account.accountUid;
      const categoryUid = account.defaultCategory;

      // Fetch remaining data in parallel, with individual error handling
      const thirtyDaysAgo = daysAgoISO(30);

      const [accountHolder, balance, transactions, savingsGoals] = await Promise.allSettled([
        fetchAccountHolder(token),
        fetchBalance(token, accountUid),
        fetchTransactions(token, accountUid, categoryUid, thirtyDaysAgo),
        fetchSavingsGoals(token, accountUid),
      ]);

      // Extract results, keeping nulls for failed requests
      const holderResult = accountHolder.status === 'fulfilled' ? accountHolder.value : null;
      const balanceResult = balance.status === 'fulfilled' ? balance.value : null;
      const txResult = transactions.status === 'fulfilled' ? transactions.value : null;
      const goalsResult = savingsGoals.status === 'fulfilled' ? savingsGoals.value : null;

      // Collect partial errors
      const partialErrors: string[] = [];
      if (balance.status === 'rejected') {
        const e = balance.reason;
        partialErrors.push(`Balance: ${e instanceof StarlingApiError ? e.detail : 'Failed to load'}`);
      }
      if (transactions.status === 'rejected') {
        const e = transactions.reason;
        partialErrors.push(`Transactions: ${e instanceof StarlingApiError ? e.detail : 'Failed to load'}`);
      }
      if (savingsGoals.status === 'rejected') {
        const e = savingsGoals.reason;
        partialErrors.push(`Savings: ${e instanceof StarlingApiError ? e.detail : 'Failed to load'}`);
      }

      // Sort transactions by time, newest first
      const sortedTx = txResult
        ? [...txResult].sort((a, b) => new Date(b.transactionTime).getTime() - new Date(a.transactionTime).getTime())
        : null;

      updateState((prev) => ({
        ...prev,
        selectedAccountUid: accountUid,
        cache: {
          accountHolder: holderResult ?? prev.cache.accountHolder,
          accounts,
          balance: balanceResult ?? prev.cache.balance,
          transactions: sortedTx ?? prev.cache.transactions,
          savingsGoals: goalsResult ?? prev.cache.savingsGoals,
          lastFetchedAt: new Date().toISOString(),
        },
      }));

      if (partialErrors.length > 0) {
        setError(`Some data couldn't be loaded:\n${partialErrors.join('\n')}`);
      }
    } catch (err) {
      if (err instanceof StarlingApiError) {
        if (err.status === 429) {
          setRetryInfo(err.detail);
        }
        setError(err.detail);
      } else {
        setError('Failed to fetch account data. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [token, updateState]);

  // Fetch on mount if no cached data or data is stale (>5 min)
  useEffect(() => {
    const lastFetch = state.cache.lastFetchedAt;
    const isStale = !lastFetch || Date.now() - new Date(lastFetch).getTime() > 5 * 60 * 1000;
    if (isStale) {
      refreshData();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { balance, transactions, savingsGoals, accounts } = state.cache;
  const account = accounts?.[0];
  const currency = account?.currency || 'GBP';

  return (
    <div className="flex flex-1 flex-col overflow-hidden sb-animate-in">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(200,164,78,0.08)' }}>
        <div className="flex items-center gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--sb-brass)' }}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <div>
            <h1 className="text-base font-semibold" style={{ color: 'var(--sb-cream)', letterSpacing: '-0.2px' }}>
              Starling Bank
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {state.cache.lastFetchedAt && (
            <span className="text-xs" style={{ color: 'var(--sb-brass-dim)' }}>
              Updated {formatTime(state.cache.lastFetchedAt)}
            </span>
          )}
          <button
            onClick={refreshData}
            disabled={loading}
            className="sb-btn-ghost flex items-center gap-1.5"
            style={{ padding: '6px 12px', fontSize: 12 }}
          >
            {loading ? (
              <span className="sb-spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            )}
            Refresh
          </button>
          <button onClick={onLogout} className="sb-btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}>
            Logout
          </button>
        </div>
      </div>

      {/* Error / Retry banners */}
      {(error || retryInfo) && (
        <div className="px-5 pt-3 shrink-0">
          {error && (
            <div className="sb-error-banner sb-animate-in mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div style={{ whiteSpace: 'pre-line' }}>{error}</div>
            </div>
          )}
          {retryInfo && !error && (
            <div className="sb-info-banner sb-animate-in mb-2">{retryInfo}</div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex shrink-0 px-3" style={{ borderBottom: '1px solid rgba(200,164,78,0.08)' }}>
        {(['overview', 'transactions', 'savings'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`sb-tab ${tab === t ? 'active' : ''}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto sb-scrollable p-4">
        {loading && !state.cache.lastFetchedAt ? (
          <div className="flex flex-col items-center justify-center py-20 sb-animate-in">
            <div className="sb-spinner mb-4" style={{ width: 32, height: 32, borderWidth: 2.5 }} />
            <p className="text-sm" style={{ color: 'var(--sb-cream-dim)' }}>
              Loading your account...
            </p>
          </div>
        ) : (
          <>
            {tab === 'overview' && (
              <OverviewTab balance={balance} transactions={transactions} currency={currency} />
            )}
            {tab === 'transactions' && (
              <TransactionsTab transactions={transactions} />
            )}
            {tab === 'savings' && (
              <SavingsTab savingsGoals={savingsGoals} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════

function OverviewTab({
  balance,
  transactions,
  currency,
}: {
  balance: StarlingBalance | null;
  transactions: StarlingFeedItem[] | null;
  currency: string;
}) {
  return (
    <div className="flex flex-col gap-4 sb-animate-in">
      {/* Balance cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="sb-card p-4">
          <div className="sb-stat-label mb-2">Available Balance</div>
          <div
            className="text-2xl font-semibold sb-mono sb-glow-green"
            style={{ color: 'var(--sb-green-light)' }}
          >
            {balance ? formatMoney(balance.effectiveBalance.minorUnits, currency) : '---'}
          </div>
        </div>
        <div className="sb-card p-4">
          <div className="sb-stat-label mb-2">Current Balance</div>
          <div className="text-2xl font-semibold sb-mono" style={{ color: 'var(--sb-cream)' }}>
            {balance ? formatMoney(balance.amount.minorUnits, currency) : '---'}
          </div>
        </div>
      </div>

      {/* Additional balance info */}
      {balance && (
        <div className="grid grid-cols-2 gap-4">
          <div className="sb-card p-4">
            <div className="sb-stat-label mb-1">Cleared Balance</div>
            <div className="text-lg sb-mono" style={{ color: 'var(--sb-cream-dim)' }}>
              {formatMoney(balance.clearedBalance.minorUnits, currency)}
            </div>
          </div>
          <div className="sb-card p-4">
            <div className="sb-stat-label mb-1">Pending</div>
            <div className="text-lg sb-mono" style={{ color: 'var(--sb-brass)' }}>
              {formatMoney(balance.pendingTransactions.minorUnits, currency)}
            </div>
          </div>
        </div>
      )}

      {/* Spending chart */}
      {transactions && transactions.length > 0 && (
        <div className="sb-card p-4">
          <div className="sb-stat-label mb-3">Spending by Category (30 days)</div>
          <SpendingChart transactions={transactions} />
        </div>
      )}

      {/* Daily trend */}
      {transactions && transactions.length > 2 && (
        <div className="sb-card p-4">
          <div className="sb-stat-label mb-3">Daily Spending Trend</div>
          <DailyTrendChart transactions={transactions} />
        </div>
      )}

      {/* Recent transactions preview */}
      {transactions && transactions.length > 0 && (
        <div className="sb-card p-4">
          <div className="sb-stat-label mb-3">Recent Transactions</div>
          <div>
            {transactions.slice(0, 5).map((tx) => (
              <TransactionRow key={tx.feedItemUid} tx={tx} />
            ))}
          </div>
        </div>
      )}

      {!transactions && !balance && (
        <div className="flex flex-col items-center justify-center py-12 sb-animate-in">
          <p className="text-sm" style={{ color: 'var(--sb-cream-dim)' }}>
            No data available. Click Refresh to load your account.
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TRANSACTIONS TAB
// ═══════════════════════════════════════════════════════════════

function TransactionsTab({ transactions }: { transactions: StarlingFeedItem[] | null }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!transactions) return [];
    if (!search.trim()) return transactions;
    const q = search.toLowerCase();
    return transactions.filter(
      (tx) =>
        tx.counterPartyName?.toLowerCase().includes(q) ||
        tx.reference?.toLowerCase().includes(q) ||
        tx.spendingCategory?.toLowerCase().includes(q),
    );
  }, [transactions, search]);

  // Group by date
  const grouped = useMemo(() => {
    const groups = new Map<string, StarlingFeedItem[]>();
    for (const tx of filtered) {
      const date = new Date(tx.transactionTime).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date)!.push(tx);
    }
    return groups;
  }, [filtered]);

  if (!transactions || transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 sb-animate-in">
        <p className="text-sm" style={{ color: 'var(--sb-cream-dim)' }}>
          No transactions to display.
        </p>
      </div>
    );
  }

  return (
    <div className="sb-animate-in">
      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transactions..."
          className="sb-input"
          style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}
        />
      </div>

      {/* Transaction groups */}
      {Array.from(grouped.entries()).map(([date, txs]) => (
        <div key={date} className="mb-4">
          <div className="sb-stat-label mb-2 px-2">{date}</div>
          <div className="sb-card">
            {txs.map((tx) => (
              <div key={tx.feedItemUid} className="sb-ledger-line">
                <TransactionRow tx={tx} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && search && (
        <div className="text-center py-8">
          <p className="text-sm" style={{ color: 'var(--sb-cream-dim)' }}>
            No transactions match "{search}"
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SAVINGS TAB
// ═══════════════════════════════════════════════════════════════

function SavingsTab({ savingsGoals }: { savingsGoals: StarlingSavingsGoal[] | null }) {
  if (!savingsGoals || savingsGoals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 sb-animate-in">
        <div className="sb-vault-icon mb-6" style={{ width: 60, height: 60 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--sb-brass)' }}>
            <path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16" />
            <path d="M3 21h18" />
            <path d="M9 7h6" />
            <path d="M9 11h6" />
            <path d="M9 15h4" />
          </svg>
        </div>
        <p className="text-sm" style={{ color: 'var(--sb-cream-dim)' }}>
          No savings goals found. Create one in your Starling app.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sb-animate-in">
      {savingsGoals.map((goal) => {
        const saved = goal.totalSaved.minorUnits;
        const target = goal.target?.minorUnits || 0;
        const percent = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
        const currency = goal.totalSaved.currency;

        return (
          <div key={goal.savingsGoalUid} className="sb-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-sm" style={{ color: 'var(--sb-cream)' }}>
                {goal.name}
              </span>
              <span className="text-xs sb-mono" style={{ color: 'var(--sb-brass)' }}>
                {goal.state === 'ACTIVE' ? 'Active' : goal.state}
              </span>
            </div>

            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xl font-semibold sb-mono sb-glow-green" style={{ color: 'var(--sb-green-light)' }}>
                {formatMoney(saved, currency)}
              </span>
              {target > 0 && (
                <span className="text-sm sb-mono" style={{ color: 'var(--sb-cream-dim)' }}>
                  of {formatMoney(target, currency)}
                </span>
              )}
            </div>

            {target > 0 && (
              <>
                <div className="sb-progress-track">
                  <div className="sb-progress-fill" style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-1.5 text-right">
                  <span className="text-xs sb-mono" style={{ color: 'var(--sb-brass-dim)' }}>
                    {percent.toFixed(1)}%
                  </span>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TRANSACTION ROW
// ═══════════════════════════════════════════════════════════════

function TransactionRow({ tx }: { tx: StarlingFeedItem }) {
  const isOut = tx.direction === 'OUT';
  const amount = formatMoney(tx.amount.minorUnits, tx.amount.currency);
  const name = tx.counterPartyName || tx.reference || 'Unknown';
  const catColor = getCategoryColor(tx.spendingCategory);

  return (
    <div className="sb-tx-row">
      {/* Category indicator */}
      <div
        className="flex-shrink-0"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: catColor,
          boxShadow: `0 0 6px ${catColor}40`,
        }}
      />

      {/* Name & details */}
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate" style={{ color: 'var(--sb-cream)' }}>
          {name}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs" style={{ color: 'var(--sb-cream-dim)' }}>
            {formatDate(tx.transactionTime)} {formatTime(tx.transactionTime)}
          </span>
          {tx.spendingCategory && tx.spendingCategory !== 'NONE' && (
            <span className="text-xs" style={{ color: catColor }}>
              {friendlyCategory(tx.spendingCategory)}
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div
        className="text-sm font-medium sb-mono flex-shrink-0"
        style={{
          color: isOut ? 'var(--sb-cream)' : 'var(--sb-green-light)',
          textShadow: isOut ? 'none' : '0 0 12px rgba(45,122,79,0.3)',
        }}
      >
        {isOut ? '-' : '+'}{amount}
      </div>

      {/* Status badge */}
      {tx.status === 'PENDING' && (
        <span
          className="text-xs flex-shrink-0"
          style={{
            color: 'var(--sb-brass)',
            background: 'rgba(200,164,78,0.1)',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 10,
          }}
        >
          Pending
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SPENDING CHART (Horizontal bar chart by category)
// ═══════════════════════════════════════════════════════════════

function SpendingChart({ transactions }: { transactions: StarlingFeedItem[] }) {
  const categories = useMemo(() => {
    const totals = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.direction !== 'OUT' || tx.status === 'DECLINED' || tx.status === 'REVERSED') continue;
      const cat = tx.spendingCategory || 'NONE';
      totals.set(cat, (totals.get(cat) || 0) + tx.amount.minorUnits);
    }

    return Array.from(totals.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [transactions]);

  if (categories.length === 0) {
    return (
      <p className="text-xs text-center py-4" style={{ color: 'var(--sb-cream-dim)' }}>
        No outgoing transactions found.
      </p>
    );
  }

  const maxTotal = categories[0]?.total || 1;

  return (
    <div className="flex flex-col gap-2.5">
      {categories.map(({ category, total }) => {
        const color = getCategoryColor(category);
        const pct = (total / maxTotal) * 100;

        return (
          <div key={category}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs" style={{ color: 'var(--sb-cream-dim)' }}>
                {friendlyCategory(category)}
              </span>
              <span className="text-xs sb-mono" style={{ color }}>
                {formatMoney(total, 'GBP')}
              </span>
            </div>
            <div className="sb-progress-track" style={{ height: 6 }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 3,
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${color}88 0%, ${color} 100%)`,
                  boxShadow: `0 0 8px ${color}40`,
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DAILY TREND CHART (SVG line chart)
// ═══════════════════════════════════════════════════════════════

function DailyTrendChart({ transactions }: { transactions: StarlingFeedItem[] }) {
  const dailyData = useMemo(() => {
    const dailyTotals = new Map<string, { out: number; in_: number }>();

    for (const tx of transactions) {
      if (tx.status === 'DECLINED' || tx.status === 'REVERSED') continue;
      const dateKey = new Date(tx.transactionTime).toISOString().split('T')[0];
      const day = dailyTotals.get(dateKey) || { out: 0, in_: 0 };
      if (tx.direction === 'OUT') day.out += tx.amount.minorUnits;
      else day.in_ += tx.amount.minorUnits;
      dailyTotals.set(dateKey, day);
    }

    return Array.from(dailyTotals.entries())
      .map(([date, totals]) => ({ date, ...totals }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions]);

  if (dailyData.length < 2) return null;

  const W = 580;
  const H = 160;
  const PAD = { top: 20, right: 12, bottom: 28, left: 52 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxOut = Math.max(...dailyData.map((d) => d.out), 1);

  const points = dailyData.map((d, i) => ({
    x: PAD.left + (i / Math.max(dailyData.length - 1, 1)) * innerW,
    y: PAD.top + (1 - d.out / maxOut) * innerH,
    ...d,
  }));

  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');

  const areaPath =
    linePath +
    ` L ${points[points.length - 1].x} ${PAD.top + innerH}` +
    ` L ${points[0].x} ${PAD.top + innerH} Z`;

  // Y ticks
  const yTicks = Array.from({ length: 4 }, (_, i) => {
    const val = (maxOut * (i + 1)) / 4;
    const y = PAD.top + (1 - (i + 1) / 4) * innerH;
    return { val, y };
  });

  // X labels (first, mid, last)
  const xLabels = [
    { x: points[0].x, label: formatDate(dailyData[0].date) },
    ...(dailyData.length > 4
      ? [{
          x: points[Math.floor(points.length / 2)].x,
          label: formatDate(dailyData[Math.floor(dailyData.length / 2)].date),
        }]
      : []),
    { x: points[points.length - 1].x, label: formatDate(dailyData[dailyData.length - 1].date) },
  ];

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: '180px' }}>
        <defs>
          <linearGradient id="sb-trend-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--sb-brass)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--sb-brass)" stopOpacity="0.02" />
          </linearGradient>
          <filter id="sb-glow">
            <feGaussianBlur stdDeviation="2" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              y1={t.y}
              x2={W - PAD.right}
              y2={t.y}
              stroke="rgba(200,164,78,0.08)"
              strokeWidth="0.5"
              strokeDasharray="4 4"
            />
            <text
              x={PAD.left - 8}
              y={t.y + 3}
              textAnchor="end"
              fontSize="9"
              fill="var(--sb-brass-dim)"
              fontFamily="'DM Mono', monospace"
            >
              {formatMoney(t.val, 'GBP')}
            </text>
          </g>
        ))}

        {/* X labels */}
        {xLabels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={H - 4}
            textAnchor="middle"
            fontSize="9"
            fill="var(--sb-brass-dim)"
            fontFamily="'DM Sans', sans-serif"
          >
            {l.label}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#sb-trend-grad)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--sb-brass)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#sb-glow)"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <g key={i}>
            {i === points.length - 1 && (
              <circle cx={p.x} cy={p.y} r="5" fill="var(--sb-brass)" opacity="0.2" />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={i === points.length - 1 ? 3.5 : 2}
              fill={i === points.length - 1 ? 'var(--sb-brass)' : 'var(--sb-surface)'}
              stroke="var(--sb-brass)"
              strokeWidth={i === points.length - 1 ? 0 : 1.5}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export default StarlingApp;
