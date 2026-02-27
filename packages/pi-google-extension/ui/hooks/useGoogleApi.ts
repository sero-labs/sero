/**
 * useGoogleApi — hook for Google auth + data fetching.
 *
 * Auth: calls window.sero.google.login() for OAuth2 sign-in
 * Data: calls window.sero.google.execute() for gogcli commands
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { GoogleAppState, GmailThread, CalendarEvent } from '../../shared/types';
import { parseGmailMessage } from '../components/gmail-parser';

type StateUpdater = (fn: (prev: GoogleAppState) => GoogleAppState) => void;

interface SeroGoogleBridge {
  execute: (service: string, args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  authStatus: () => Promise<{ configured: boolean; authenticated: boolean; email?: string }>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  onAuthEvent: (cb: (event: { type: string; message: string; email?: string }) => void) => () => void;
}

function getSeroGoogle(): SeroGoogleBridge | null {
  return (window as any).sero?.google ?? null;
}

// ── Auth types ───────────────────────────────────────────────

export type AuthStatus = 'unknown' | 'checking' | 'not-configured' | 'signed-out' | 'signing-in' | 'authenticated';

export interface AuthInfo {
  status: AuthStatus;
  email: string | null;
  error: string | null;
}

// ── API interface ────────────────────────────────────────────

export interface GoogleApi {
  loading: boolean;
  error: string | null;
  auth: AuthInfo;
  checkAuth: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchInbox: (query: string, max?: number) => Promise<void>;
  fetchThread: (threadId: string) => Promise<void>;
  fetchEvents: (view: 'today' | 'week') => Promise<void>;
  fetchEventsRange: (from: string, to: string) => Promise<void>;
  fetchCalendars: () => Promise<void>;
  sendEmail: (to: string, subject: string, body: string) => Promise<boolean>;
  archiveThread: (threadId: string) => Promise<boolean>;
}

// ── Hook ─────────────────────────────────────────────────────

export function useGoogleApi(updateState: StateUpdater): GoogleApi {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auth, setAuth] = useState<AuthInfo>({ status: 'unknown', email: null, error: null });

  // Subscribe to auth progress events
  useEffect(() => {
    const api = getSeroGoogle();
    if (!api) return;
    const unsub = api.onAuthEvent((event) => {
      if (event.type === 'success') {
        setAuth({ status: 'authenticated', email: event.email ?? null, error: null });
      } else if (event.type === 'error') {
        setAuth((a) => ({ ...a, status: 'signed-out', error: event.message }));
      }
    });
    return unsub;
  }, []);

  // ── Auth ───────────────────────────────────────────────────

  const checkAuth = useCallback(async () => {
    setAuth((a) => ({ ...a, status: 'checking', error: null }));
    const api = getSeroGoogle();
    if (!api) { setAuth({ status: 'unknown', email: null, error: 'Bridge unavailable' }); return; }

    try {
      const status = await api.authStatus();
      if (!status.configured) {
        setAuth({ status: 'not-configured', email: null, error: null });
      } else if (status.authenticated) {
        setAuth({ status: 'authenticated', email: status.email ?? null, error: null });
        updateState((prev) => ({ ...prev, activeAccount: status.email ?? null }));
      } else {
        setAuth({ status: 'signed-out', email: null, error: null });
      }
    } catch (err) {
      setAuth({ status: 'unknown', email: null, error: String(err) });
    }
  }, [updateState]);

  const signIn = useCallback(async () => {
    const api = getSeroGoogle();
    if (!api) return;
    setAuth((a) => ({ ...a, status: 'signing-in', error: null }));
    try {
      await api.login();
      // Success handled by onAuthEvent listener
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuth((a) => ({ ...a, status: 'signed-out', error: msg }));
    }
  }, []);

  const signOut = useCallback(async () => {
    const api = getSeroGoogle();
    if (!api) return;
    await api.logout();
    setAuth({ status: 'signed-out', email: null, error: null });
    updateState((prev) => ({ ...prev, activeAccount: null }));
  }, [updateState]);

  // ── Data command executor ──────────────────────────────────

  const exec = useCallback(async (service: string, args: string[]): Promise<any | null> => {
    setLoading(true);
    setError(null);
    try {
      const api = getSeroGoogle();
      if (!api) { setError('Bridge unavailable'); return null; }
      const result = await api.execute(service, args);
      if (result.exitCode === 127) { setError('gogcli not found'); return null; }
      if (result.exitCode !== 0) {
        const msg = result.stderr.trim() || result.stdout.trim() || 'Command failed';
        setError(msg.length > 120 ? msg.slice(0, 120) + '…' : msg);
        return null;
      }
      try { return JSON.parse(result.stdout); } catch { return result.stdout.trim(); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Data fetchers ──────────────────────────────────────────

  const fetchInbox = useCallback(async (query: string, max = 15) => {
    const data = await exec('gmail', ['search', query, '--max', String(max)]);
    if (!data) return;
    const threads: GmailThread[] = (data.threads || []).map((t: any) => ({
      id: t.id || '', snippet: t.snippet || '',
      subject: t.messages?.[0]?.subject || t.subject || '(no subject)',
      from: t.messages?.[0]?.from || t.from || '',
      date: t.messages?.[0]?.date || t.date || '',
      labelIds: t.messages?.[0]?.labels || t.labelIds || [],
      isUnread: (t.messages?.[0]?.labels || t.labelIds || []).includes('UNREAD'),
      messageCount: t.messages?.length || t.messageCount || 1,
    }));
    updateState((prev) => ({
      ...prev,
      gmail: { ...prev.gmail, threads, lastQuery: query, lastFetchedAt: new Date().toISOString() },
    }));
  }, [exec, updateState]);

  const fetchThread = useCallback(async (threadId: string) => {
    const data = await exec('gmail', ['thread', 'get', threadId]);
    if (!data) return;
    const rawMessages: any[] = data.thread?.messages || data.messages || [];
    const messages = rawMessages.map((m) => parseGmailMessage(m, threadId));
    updateState((prev) => ({
      ...prev,
      gmail: { ...prev.gmail, selectedThreadId: threadId, selectedMessages: messages },
    }));
  }, [exec, updateState]);

  const mapEvent = (e: any): CalendarEvent => ({
    id: e.id || '', calendarId: e.organizer?.displayName || 'primary',
    summary: e.summary || '(no title)',
    start: e.start?.dateTime || e.start?.date || e.startLocal || '',
    end: e.end?.dateTime || e.end?.date || e.endLocal || '',
    startLocal: e.startLocal || '', endLocal: e.endLocal || '',
    location: e.location || '', description: e.description || '',
    attendees: (e.attendees || []).map((a: any) => {
      const name = a.displayName || a.email || '';
      const status = a.responseStatus ? ` (${a.responseStatus})` : '';
      return a.self ? `${name}${status} — you` : `${name}${status}`;
    }),
    isAllDay: !!e.start?.date && !e.start?.dateTime,
    status: e.status || '', htmlLink: e.htmlLink || '',
    visibility: e.visibility || '', eventType: e.eventType || '',
    sourceUrl: e.source?.url || '',
    reminders: (e.reminders?.overrides || []).map((r: any) => ({
      method: r.method || 'popup', minutes: r.minutes || 0,
    })),
    created: e.created || '', updated: e.updated || '',
  });

  const fetchEvents = useCallback(async (view: 'today' | 'week') => {
    const flag = view === 'today' ? '--today' : '--week';
    const data = await exec('calendar', ['events', 'primary', flag]);
    if (!data) return;
    const events = (data.events || []).map(mapEvent);
    updateState((prev) => ({
      ...prev,
      calendar: { ...prev.calendar, events, view, lastFetchedAt: new Date().toISOString() },
    }));
  }, [exec, updateState]);

  const fetchEventsRange = useCallback(async (from: string, to: string) => {
    const data = await exec('calendar', ['events', 'primary', '--from', from, '--to', to, '--max', '50']);
    if (!data) return;
    const events = (data.events || []).map(mapEvent);
    updateState((prev) => ({
      ...prev,
      calendar: { ...prev.calendar, events, lastFetchedAt: new Date().toISOString() },
    }));
  }, [exec, updateState]);

  const fetchCalendars = useCallback(async () => {
    const data = await exec('calendar', ['calendars']);
    if (!data) return;
    updateState((prev) => ({
      ...prev,
      calendar: {
        ...prev.calendar,
        calendars: (data.calendars || []).map((c: any) => ({
          id: c.id || '', summary: c.summary || c.id || '', primary: !!c.primary,
        })),
      },
    }));
  }, [exec, updateState]);

  const sendEmail = useCallback(async (to: string, subject: string, body: string): Promise<boolean> => {
    return (await exec('gmail', ['send', '--to', to, '--subject', subject, '--body', body])) !== null;
  }, [exec]);

  const archiveThread = useCallback(async (threadId: string): Promise<boolean> => {
    return (await exec('gmail', ['labels', 'modify', threadId, '--remove', 'INBOX'])) !== null;
  }, [exec]);

  return useMemo(() => ({
    loading, error, auth, checkAuth, signIn, signOut,
    fetchInbox, fetchThread, fetchEvents, fetchEventsRange, fetchCalendars, sendEmail, archiveThread,
  }), [loading, error, auth, checkAuth, signIn, signOut,
    fetchInbox, fetchThread, fetchEvents, fetchEventsRange, fetchCalendars, sendEmail, archiveThread]);
}
