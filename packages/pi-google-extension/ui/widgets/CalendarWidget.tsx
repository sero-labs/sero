/**
 * CalendarWidget — mini calendar + upcoming events for the dashboard.
 *
 * Shows a compact month grid with event dots and today's/next
 * upcoming events below. Reuses the calendar grid pattern from
 * the full Google app's MiniCalendar component.
 */

import { useState, useMemo, useCallback } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import type { GoogleAppState, CalendarEvent } from '../../shared/types';
import { DEFAULT_GOOGLE_STATE } from '../../shared/types';

// ── Date helpers ─────────────────────────────────────────────────

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayKey(): string { return toKey(new Date()); }

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// ── Component ────────────────────────────────────────────────────

export function CalendarWidget() {
  const [state] = useAppState<GoogleAppState>(DEFAULT_GOOGLE_STATE);
  const [month, setMonth] = useState(() => new Date());

  const isConnected = state.activeAccount !== null;
  const events = state.calendar.events;
  const today = todayKey();

  // Build set of event dates for dots
  const eventDates = useMemo(() => {
    const dates = new Set<string>();
    for (const e of events) {
      const d = new Date(e.start || e.startLocal || '');
      if (!isNaN(d.getTime())) dates.add(toKey(d));
    }
    return dates;
  }, [events]);

  // Upcoming events (today and future, max 3)
  const upcoming = useMemo(() => {
    const now = new Date();
    return events
      .filter((e) => {
        const d = new Date(e.end || e.endLocal || e.start || '');
        return !isNaN(d.getTime()) && d.getTime() >= now.getTime() - 3600000;
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 3);
  }, [events]);

  const changeMonth = useCallback((delta: number) => {
    setMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
  }, []);

  if (!isConnected) {
    return <NotConnected />;
  }

  return (
    <div className="flex h-full flex-col gap-2.5 p-3.5">
      {/* ── Mini calendar grid ── */}
      <MiniCalGrid month={month} today={today} eventDates={eventDates} onChangeMonth={changeMonth} />

      {/* ── Upcoming events ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
        {upcoming.length > 0 ? (
          upcoming.map((event) => (
            <EventRow key={event.id} event={event} today={today} />
          ))
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-[10px] text-[var(--text-muted)]">No upcoming events</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Mini calendar grid ───────────────────────────────────────────

function MiniCalGrid({
  month, today, eventDates, onChangeMonth,
}: {
  month: Date; today: string; eventDates: Set<string>;
  onChangeMonth: (delta: number) => void;
}) {
  const { weeks, monthLabel } = useMemo(() => {
    const year = month.getFullYear();
    const mo = month.getMonth();
    const label = month.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    const first = new Date(year, mo, 1);
    let startDay = first.getDay() - 1;
    if (startDay < 0) startDay = 6;
    const daysInMonth = new Date(year, mo + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return { weeks: rows, monthLabel: label };
  }, [month]);

  const year = month.getFullYear();
  const mo = month.getMonth();

  return (
    <div className="select-none">
      {/* Month nav */}
      <div className="flex items-center justify-between pb-1.5">
        <button
          onClick={() => onChangeMonth(-1)}
          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
        >
          <ChevronLeftIcon />
        </button>
        <span className="text-[10px] font-medium text-[var(--text-secondary)]">{monthLabel}</span>
        <button
          onClick={() => onChangeMonth(1)}
          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
        >
          <ChevronRightIcon />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 pb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-0.5 text-center text-[8px] font-medium text-[var(--text-muted)]">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 py-0.5">
          {week.map((day, di) => {
            if (day === null) return <div key={di} />;
            const key = `${year}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = key === today;
            const hasEvent = eventDates.has(key);

            return (
              <div
                key={di}
                className={`relative mx-auto flex size-6 items-center justify-center rounded-full text-[9px]
                  ${isToday
                    ? 'bg-blue-500 text-white font-bold'
                    : hasEvent
                      ? 'text-[var(--text-primary)] font-medium'
                      : 'text-[var(--text-muted)]'
                  }`}
              >
                {day}
                {hasEvent && !isToday && (
                  <span className="absolute bottom-0 left-1/2 size-[2px] -translate-x-1/2 rounded-full bg-blue-400" />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Event row ────────────────────────────────────────────────────

function EventRow({ event, today }: { event: CalendarEvent; today: string }) {
  const startDate = new Date(event.start || event.startLocal || '');
  const dateKey = toKey(startDate);
  const isToday = dateKey === today;

  return (
    <div className="flex items-center gap-2.5 rounded-md bg-[var(--bg-elevated)] px-3 py-2">
      {/* Time accent */}
      <div
        className="h-7 w-0.5 shrink-0 rounded-full"
        style={{ backgroundColor: isToday ? '#3b82f6' : '#6b7280' }}
      />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-[var(--text-primary)]">
          {event.summary}
        </div>
        <div className="flex items-center gap-1 text-[9px] text-[var(--text-muted)]">
          {event.isAllDay ? (
            <span>All day</span>
          ) : (
            <span>{formatTime(event.start || event.startLocal || '')}</span>
          )}
          {!isToday && (
            <span className="text-[var(--text-muted)]">
              &middot; {startDate.toLocaleDateString(undefined, { weekday: 'short' })}
            </span>
          )}
          {event.location && (
            <span className="truncate text-[var(--text-muted)]">
              &middot; {event.location}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inline SVG icons ─────────────────────────────────────────────

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3">
      <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3">
      <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NotConnected() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-3">
      <div className="relative size-12">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/15 to-green-500/10" />
        <svg viewBox="0 0 24 24" fill="none" className="absolute inset-0 m-auto size-6 text-[var(--text-muted)]">
          <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <span className="text-xs text-[var(--text-muted)]">Google not connected</span>
      <span className="text-[10px] text-[var(--text-muted)] opacity-60">
        Open Google app to sign in
      </span>
    </div>
  );
}

export default CalendarWidget;
