/**
 * GoogleApp — main Sero web UI for Gmail + Google Calendar.
 *
 * Tabbed layout switching between MailView and CalendarView.
 * Includes auth setup flow for first-time Google account connection.
 * Uses gogcli via the window.sero.google IPC bridge for direct
 * data fetching, and useAppState for persistent cached state.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import { Mail, CalendarDays, RefreshCw } from 'lucide-react';
import type { GoogleAppState } from '../shared/types';
import { DEFAULT_GOOGLE_STATE } from '../shared/types';
import { MailView } from './components/MailView';
import { CalendarView } from './components/CalendarView';
import { AuthSetup } from './components/AuthSetup';
import { useGoogleApi } from './hooks/useGoogleApi';
import './styles.css';

export function GoogleApp() {
  const [state, updateState] = useAppState<GoogleAppState>(DEFAULT_GOOGLE_STATE);
  const containerRef = useRef<HTMLDivElement>(null);
  const google = useGoogleApi(updateState);

  // Auto-focus container for keyboard events
  useEffect(() => { containerRef.current?.focus(); }, []);

  // Check auth on mount
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    google.checkAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch data once authenticated (and stale)
  const hasFetched = useRef(false);
  useEffect(() => {
    if (hasFetched.current) return;
    if (google.auth.status !== 'authenticated') return;
    hasFetched.current = true;

    const staleMs = 5 * 60 * 1000;
    const tab = state.activeTab;
    const lastFetch = tab === 'mail' ? state.gmail.lastFetchedAt : state.calendar.lastFetchedAt;

    if (!lastFetch || Date.now() - new Date(lastFetch).getTime() > staleMs) {
      if (tab === 'mail') google.fetchInbox(state.gmail.lastQuery || 'newer_than:3d');
      else google.fetchEvents(state.calendar.view);
    }
  }, [google.auth.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTab = useCallback((tab: 'mail' | 'calendar') => {
    updateState((prev) => ({ ...prev, activeTab: tab }));
  }, [updateState]);

  const handleRefresh = useCallback(() => {
    if (state.activeTab === 'mail') {
      google.fetchInbox(state.gmail.lastQuery || 'newer_than:3d');
    } else {
      google.fetchEvents(state.calendar.view);
    }
  }, [state.activeTab, state.gmail.lastQuery, state.calendar.view, google]);

  const isReady = google.auth.status === 'authenticated';

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="flex h-full w-full flex-col overflow-hidden bg-[var(--bg-base)] outline-none"
    >
      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border-subtle)] px-3 py-1.5">
        <TabButton
          active={state.activeTab === 'mail'}
          onClick={() => setTab('mail')}
          icon={<Mail className="size-3.5" />}
          label="Mail"
        />
        <TabButton
          active={state.activeTab === 'calendar'}
          onClick={() => setTab('calendar')}
          icon={<CalendarDays className="size-3.5" />}
          label="Calendar"
        />

        <div className="flex-1" />

        {/* Refresh button — only when authenticated */}
        {isReady && (
          <button
            onClick={handleRefresh}
            disabled={google.loading}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)]/80 hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <RefreshCw className={`size-3 ${google.loading ? 'animate-spin' : ''}`} />
            {google.loading ? 'Syncing…' : 'Sync'}
          </button>
        )}

        {/* Error indicator */}
        {google.error && isReady && (
          <span className="max-w-[200px] truncate text-[11px] text-red-400" title={google.error}>
            {google.error}
          </span>
        )}
      </div>

      {/* Auth: sign-in form when not authenticated, account banner when signed in */}
      <AuthSetup auth={google.auth} google={google} />

      {/* Active view — only when authenticated */}
      <div className="flex-1 overflow-hidden">
        {isReady ? (
          state.activeTab === 'mail' ? (
            <MailView state={state} updateState={updateState} google={google} />
          ) : (
            <CalendarView state={state} updateState={updateState} google={google} />
          )
        ) : null}
      </div>
    </div>
  );
}

// ── Tab button ───────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]/60 hover:text-[var(--text-secondary)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export default GoogleApp;
