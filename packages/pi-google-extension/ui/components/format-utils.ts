/**
 * Formatting utilities for the Google app UI.
 *
 * Date formatting, name extraction, and event grouping helpers
 * used by both MailView and CalendarView components.
 */

import type { CalendarEvent } from '../../shared/types';

// ── Date formatting ──────────────────────────────────────────

/**
 * Format a date string into a relative label (e.g. "2m ago", "3h ago", "Yesterday").
 */
export function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return '';

  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHr = Math.floor(diffMs / 3_600_000);
    const diffDay = Math.floor(diffMs / 86_400_000);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;

    // Format as short date
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format a time range for calendar events.
 */
export function formatTimeRange(start: string, end: string, isAllDay: boolean): string {
  if (isAllDay) return 'All day';
  if (!start) return '';

  try {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : null;

    const fmt = (d: Date) =>
      d.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

    if (endDate) {
      return `${fmt(startDate)} – ${fmt(endDate)}`;
    }
    return fmt(startDate);
  } catch {
    return start;
  }
}

// ── Name extraction ──────────────────────────────────────────

/**
 * Extract display name from an email "Name <email>" string.
 */
export function extractName(fromStr: string): string {
  if (!fromStr) return 'Unknown';

  // "John Doe <john@example.com>" → "John Doe"
  const match = fromStr.match(/^(.+?)\s*<.+>$/);
  if (match) {
    return match[1].replace(/^["']|["']$/g, '').trim();
  }

  // "john@example.com" → "john"
  if (fromStr.includes('@')) {
    return fromStr.split('@')[0] || fromStr;
  }

  return fromStr;
}

// ── Event grouping ───────────────────────────────────────────

/**
 * Group calendar events by day label ("Today", "Tomorrow", "Mon Jan 20", etc.).
 */
export function groupEventsByDay(events: CalendarEvent[]): [string, CalendarEvent[]][] {
  const groups = new Map<string, CalendarEvent[]>();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  for (const event of events) {
    const eventDate = new Date(event.start || event.startLocal || '');
    eventDate.setHours(0, 0, 0, 0);

    let label: string;
    if (eventDate.getTime() === today.getTime()) {
      label = 'Today';
    } else if (eventDate.getTime() === tomorrow.getTime()) {
      label = 'Tomorrow';
    } else {
      label = eventDate.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    }

    const existing = groups.get(label) || [];
    existing.push(event);
    groups.set(label, existing);
  }

  return Array.from(groups.entries());
}
