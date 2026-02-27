/**
 * MiniCalendar — compact month grid with day selection.
 *
 * Highlights today, selected day, and days with events.
 */

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MiniCalendarProps {
  /** Currently viewed month (any date in that month). */
  month: Date;
  /** Currently selected date (YYYY-MM-DD). */
  selectedDate: string | null;
  /** Set of dates that have events (YYYY-MM-DD). */
  eventDates: Set<string>;
  onSelectDate: (date: string) => void;
  onChangeMonth: (delta: number) => void;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayKey(): string { return toKey(new Date()); }

export function MiniCalendar({ month, selectedDate, eventDates, onSelectDate, onChangeMonth }: MiniCalendarProps) {
  const today = todayKey();

  const { weeks, monthLabel } = useMemo(() => {
    const year = month.getFullYear();
    const mo = month.getMonth();
    const label = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    // First day of month, adjust to Monday start
    const first = new Date(year, mo, 1);
    let startDay = first.getDay() - 1;
    if (startDay < 0) startDay = 6; // Sunday → 6

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
    <div className="w-full select-none">
      {/* Month nav */}
      <div className="flex items-center justify-between px-1 pb-1.5">
        <button
          onClick={() => onChangeMonth(-1)}
          className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
        >
          <ChevronLeft className="size-3" />
        </button>
        <span className="text-[11px] font-medium text-[var(--text-secondary)]">{monthLabel}</span>
        <button
          onClick={() => onChangeMonth(1)}
          className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
        >
          <ChevronRight className="size-3" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-0">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-0.5 text-center text-[9px] font-medium text-[var(--text-muted)]">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-0">
          {week.map((day, di) => {
            if (day === null) return <div key={di} />;
            const key = `${year}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = key === today;
            const isSelected = key === selectedDate;
            const hasEvent = eventDates.has(key);

            return (
              <button
                key={di}
                onClick={() => onSelectDate(key)}
                className={`relative mx-auto flex size-6 items-center justify-center rounded-full text-[10px] transition-colors
                  ${isSelected
                    ? 'bg-blue-500 text-white font-semibold'
                    : isToday
                      ? 'bg-blue-500/15 text-blue-400 font-semibold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                  }`}
              >
                {day}
                {hasEvent && !isSelected && (
                  <span className="absolute bottom-0.5 left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-blue-400" />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
