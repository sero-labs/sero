/**
 * Shared state shape for the Google Workspace app.
 *
 * Both the Pi extension and the Sero web UI read/write a JSON file
 * matching this shape. Gmail threads and calendar events are cached
 * from gogcli JSON output.
 */

// ── Gmail types ──────────────────────────────────────────────

export interface GmailThread {
  id: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  labelIds: string[];
  isUnread: boolean;
  messageCount: number;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  /** Plain-text body. */
  body: string;
  /** HTML body (if available). */
  bodyHtml: string;
  snippet: string;
}

// ── Calendar types ───────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  calendarId: string;
  summary: string;
  start: string;
  end: string;
  startLocal?: string;
  endLocal?: string;
  location?: string;
  description?: string;
  attendees?: string[];
  isAllDay: boolean;
  status?: string;
  htmlLink?: string;
  visibility?: string;
  eventType?: string;
  sourceUrl?: string;
  reminders?: { method: string; minutes: number }[];
  created?: string;
  updated?: string;
}

export interface CalendarInfo {
  id: string;
  summary: string;
  primary: boolean;
}

// ── App state ────────────────────────────────────────────────

export interface GoogleAppState {
  /** Active tab in the UI. */
  activeTab: 'mail' | 'calendar';

  /** Gmail cached data. */
  gmail: {
    threads: GmailThread[];
    selectedThreadId: string | null;
    selectedMessages: GmailMessage[];
    lastQuery: string;
    lastFetchedAt: string | null;
  };

  /** Calendar cached data. */
  calendar: {
    events: CalendarEvent[];
    calendars: CalendarInfo[];
    view: 'today' | 'week';
    lastFetchedAt: string | null;
  };

  /** Active Google account email (from gogcli auth). */
  activeAccount: string | null;
}

export const DEFAULT_GOOGLE_STATE: GoogleAppState = {
  activeTab: 'mail',
  gmail: {
    threads: [],
    selectedThreadId: null,
    selectedMessages: [],
    lastQuery: 'newer_than:3d',
    lastFetchedAt: null,
  },
  calendar: {
    events: [],
    calendars: [],
    view: 'today',
    lastFetchedAt: null,
  },
  activeAccount: null,
};
