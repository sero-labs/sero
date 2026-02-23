/**
 * Starling Bank API client.
 *
 * Proxies requests through Electron's main process via IPC
 * to bypass browser CORS restrictions.
 */

import type {
  StarlingAccount,
  StarlingBalance,
  StarlingFeedItem,
  StarlingAccountHolder,
  StarlingSavingsGoal,
} from '../../shared/types';

const API_BASE = 'https://api.starlingbank.com/api/v2';
const MAX_RETRIES = 4;
const INITIAL_BACKOFF_MS = 1000;

// ── Error class ─────────────────────────────────────────────

export class StarlingApiError extends Error {
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

// ── Core fetch ──────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiFetch<T>(
  path: string,
  token: string,
  params?: Record<string, string>,
): Promise<T> {
  let url = `${API_BASE}${path}`;
  if (params) url += `?${new URLSearchParams(params).toString()}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'User-Agent': 'SeroStarlingApp/1.0',
  };

  let lastError: StarlingApiError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = lastError?.retryAfter
        ? lastError.retryAfter * 1000
        : INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      await sleep(backoff);
    }

    let status: number;
    let body: string;
    let resHeaders: Record<string, string>;

    try {
      if (typeof window !== 'undefined' && window.sero?.net?.fetch) {
        const res = await window.sero.net.fetch({ url, method: 'GET', headers });
        status = res.status;
        body = res.body;
        resHeaders = res.headers;
      } else {
        const res = await fetch(url, { headers });
        status = res.status;
        body = await res.text();
        resHeaders = {};
        res.headers.forEach((v, k) => { resHeaders[k] = v; });
      }
    } catch (err) {
      lastError = new StarlingApiError(
        0, 'Network error',
        err instanceof Error ? err.message : 'Failed to connect. Check your internet.',
      );
      continue;
    }

    if (status >= 200 && status < 300) return JSON.parse(body) as T;

    if (status === 429) {
      const retryAfter = parseInt(resHeaders['retry-after'] || '0', 10) || undefined;
      lastError = new StarlingApiError(429, 'Rate limited',
        `Rate limited. ${retryAfter ? `Retry after ${retryAfter}s.` : 'Backing off...'}`,
        retryAfter);
      continue;
    }

    if (status === 401) {
      throw new StarlingApiError(401, 'Unauthorized',
        'Your access token is invalid or expired. Please forget this account and re-enter a valid token.');
    }

    if (status === 403) {
      let detail = 'Your token does not have permission for this request.';
      try { const p = JSON.parse(body); detail = p?.error_description || p?.message || detail; } catch {}
      throw new StarlingApiError(403, 'Forbidden', detail);
    }

    if (status >= 500) {
      let detail = `Starling API returned ${status}.`;
      try { const p = JSON.parse(body); if (p?.message) detail = p.message; } catch {}
      lastError = new StarlingApiError(status, 'Server error', detail);
      continue;
    }

    let detail = `Request failed with status ${status}.`;
    try { const p = JSON.parse(body); detail = p?.message || p?.error || detail; } catch {}
    throw new StarlingApiError(status, 'Request failed', detail);
  }

  throw lastError || new StarlingApiError(0, 'Request failed', 'All retry attempts exhausted.');
}

// ── Convenience wrappers ────────────────────────────────────

export async function fetchAccounts(token: string) {
  const res = await apiFetch<{ accounts: StarlingAccount[] }>('/accounts', token);
  return res.accounts;
}

export async function fetchBalance(token: string, accountUid: string) {
  return apiFetch<StarlingBalance>(`/accounts/${accountUid}/balance`, token);
}

export async function fetchAccountHolder(token: string) {
  return apiFetch<StarlingAccountHolder>('/account-holder', token);
}

export async function fetchTransactions(
  token: string, accountUid: string, categoryUid: string, since?: string,
) {
  const params: Record<string, string> = {};
  if (since) params.changesSince = since;
  const res = await apiFetch<{ feedItems: StarlingFeedItem[] }>(
    `/feed/account/${accountUid}/category/${categoryUid}`, token, params,
  );
  return res.feedItems;
}

export async function fetchSavingsGoals(token: string, accountUid: string) {
  const res = await apiFetch<{ savingsGoalList: StarlingSavingsGoal[] }>(
    `/account/${accountUid}/savings-goals`, token,
  );
  return res.savingsGoalList || [];
}
