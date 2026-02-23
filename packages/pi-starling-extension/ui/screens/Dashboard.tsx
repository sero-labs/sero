/**
 * Dashboard — header, tabs, data fetching, tab content.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { StarlingState } from '../../shared/types';
import { StarlingApiError, fetchAccounts, fetchBalance, fetchAccountHolder, fetchTransactions, fetchSavingsGoals } from '../lib/api';
import { formatTime, daysAgoISO } from '../lib/helpers';
import { ErrorBanner } from './LoginScreen';
import { OverviewTab } from '../components/OverviewTab';
import { TransactionsTab } from '../components/TransactionsTab';
import { SavingsTab } from '../components/SavingsTab';

type DashTab = 'overview' | 'transactions' | 'savings';

export function Dashboard({
  token,
  state,
  updateState,
  onLock,
  onForget,
}: {
  token: string;
  state: StarlingState;
  updateState: (updater: (prev: StarlingState) => StarlingState) => void;
  onLock: () => void;
  onForget: () => void;
}) {
  const [tab, setTab] = useState<DashTab>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryInfo, setRetryInfo] = useState<string | null>(null);
  const [showForget, setShowForget] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const fetchingRef = useRef(false);

  const refreshData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    setRetryInfo(null);

    try {
      const accounts = await fetchAccounts(token);
      if (!accounts?.length) { setError('No accounts found.'); return; }

      const account = accounts[0];
      const thirtyDaysAgo = daysAgoISO(30);

      const [accountHolder, balance, transactions, savingsGoals] = await Promise.allSettled([
        fetchAccountHolder(token),
        fetchBalance(token, account.accountUid),
        fetchTransactions(token, account.accountUid, account.defaultCategory, thirtyDaysAgo),
        fetchSavingsGoals(token, account.accountUid),
      ]);

      const partialErrors: string[] = [];
      const extract = <T,>(r: PromiseSettledResult<T>, label: string): T | null => {
        if (r.status === 'fulfilled') return r.value;
        const e = r.reason;
        partialErrors.push(`${label}: ${e instanceof StarlingApiError ? e.detail : 'Failed to load'}`);
        return null;
      };

      const holderResult = extract(accountHolder, 'Account');
      const balanceResult = extract(balance, 'Balance');
      const txResult = extract(transactions, 'Transactions');
      const goalsResult = extract(savingsGoals, 'Savings');

      const sortedTx = txResult
        ? [...txResult].sort((a, b) => new Date(b.transactionTime).getTime() - new Date(a.transactionTime).getTime())
        : null;

      updateState((prev) => ({
        ...prev,
        selectedAccountUid: account.accountUid,
        cache: {
          accountHolder: holderResult ?? prev.cache.accountHolder,
          accounts,
          balance: balanceResult ?? prev.cache.balance,
          transactions: sortedTx ?? prev.cache.transactions,
          savingsGoals: goalsResult ?? prev.cache.savingsGoals,
          lastFetchedAt: new Date().toISOString(),
        },
      }));

      if (partialErrors.length) setError(`Some data couldn't be loaded:\n${partialErrors.join('\n')}`);
    } catch (err) {
      if (err instanceof StarlingApiError) {
        if (err.status === 429) setRetryInfo(err.detail);
        setError(err.detail);
      } else {
        setError('Failed to fetch account data. Check your connection.');
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [token, updateState]);

  useEffect(() => {
    const last = state.cache.lastFetchedAt;
    const stale = !last || Date.now() - new Date(last).getTime() > 5 * 60 * 1000;
    if (stale) refreshData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { balance, transactions, savingsGoals, accounts } = state.cache;
  const currency = accounts?.[0]?.currency || 'GBP';

  const confirmPhrase = 'FORGET MY ACCOUNT';

  return (
    <div className="flex flex-1 flex-col overflow-hidden sb-animate-in">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-4 py-2"
        style={{ borderBottom: '1px solid var(--sb-border)' }}>
        <div className="flex items-center gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" style={{ color: 'var(--sb-accent)' }}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span className="text-sm font-semibold" style={{ color: 'var(--sb-text)' }}>
            Starling Bank
          </span>
        </div>
        <div className="flex items-center gap-2">
          {state.cache.lastFetchedAt && (
            <span className="text-xs" style={{ color: 'var(--sb-dim)' }}>
              Updated {formatTime(state.cache.lastFetchedAt)}
            </span>
          )}
          <button onClick={refreshData} disabled={loading}
            className="sb-btn-ghost flex items-center gap-1.5" style={{ padding: '5px 10px', fontSize: 12 }}>
            {loading
              ? <span className="sb-spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} />
              : <RefreshIcon />}
            Refresh
          </button>
          <button onClick={onLock} className="sb-btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }}>
            Lock
          </button>
          <button onClick={() => setShowForget(true)} className="sb-btn-danger"
            style={{ padding: '5px 10px', fontSize: 12 }}>
            Forget
          </button>
        </div>
      </div>

      {/* Forget confirmation */}
      {showForget && (
        <div className="shrink-0 px-4 pt-3">
          <div className="sb-card p-4 sb-animate-in" style={{ borderColor: 'rgba(248,113,113,0.25)' }}>
            <p className="mb-2 text-sm" style={{ color: 'var(--sb-text)' }}>
              Type <strong style={{ color: 'var(--sb-danger)' }}>{confirmPhrase}</strong> to permanently delete your token and data:
            </p>
            <div className="flex gap-2">
              <input
                type="text" value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={confirmPhrase}
                className="sb-input flex-1"
                style={{ fontFamily: "'DM Sans', sans-serif", letterSpacing: 0, fontSize: 13 }}
                autoFocus
              />
              <button onClick={() => { setShowForget(false); setConfirmText(''); }}
                className="sb-btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}>Cancel</button>
              <button onClick={() => { if (confirmText.trim() === confirmPhrase) onForget(); }}
                disabled={confirmText.trim() !== confirmPhrase}
                className="sb-btn-danger" style={{ padding: '5px 12px', fontSize: 12 }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Error banners */}
      {(error || retryInfo) && (
        <div className="shrink-0 px-4 pt-3">
          {error && <ErrorBanner message={error} />}
          {retryInfo && !error && (
            <div className="sb-animate-in mb-2 rounded-lg p-3 text-sm"
              style={{ background: 'var(--sb-accent-glow)', color: 'var(--sb-muted)' }}>
              {retryInfo}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex shrink-0 px-3" style={{ borderBottom: '1px solid var(--sb-border)' }}>
        {(['overview', 'transactions', 'savings'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`sb-tab ${tab === t ? 'active' : ''}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="sb-scrollable flex-1 overflow-y-auto p-4">
        {loading && !state.cache.lastFetchedAt ? (
          <div className="sb-animate-in flex flex-col items-center justify-center py-20">
            <div className="sb-spinner mb-4" style={{ width: 32, height: 32, borderWidth: 2.5 }} />
            <p className="text-sm" style={{ color: 'var(--sb-muted)' }}>Loading your account…</p>
          </div>
        ) : (
          <>
            {tab === 'overview' && <OverviewTab balance={balance} transactions={transactions} currency={currency} />}
            {tab === 'transactions' && <TransactionsTab transactions={transactions} />}
            {tab === 'savings' && <SavingsTab savingsGoals={savingsGoals} />}
          </>
        )}
      </div>
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}
