/**
 * EntryList — scrollable list of weight entries with remove action.
 */

import { useCallback } from 'react';
import type { WeightEntry, WeightUnit } from '../shared/types';
import { sortedEntries, formatWeight, unitLabel, formatDateLong, daysAgo } from './utils';

interface EntryListProps {
  entries: WeightEntry[];
  unit: WeightUnit;
  onRemove: (id: number) => void;
}

export function EntryList({ entries, unit, onRemove }: EntryListProps) {
  const sorted = sortedEntries(entries).reverse(); // newest first

  if (sorted.length === 0) return null;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-5 pb-1.5 pt-3">
        <h3 className="text-xs uppercase tracking-widest" style={{ color: 'var(--wt-muted)' }}>
          History
        </h3>
        <span className="text-xs tabular-nums" style={{ color: 'var(--wt-muted)' }}>
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>
      <ul>
        {sorted.map((entry, i) => {
          const prev = i < sorted.length - 1 ? sorted[i + 1] : null;
          const diff = prev ? entry.weight - prev.weight : null;

          return (
            <li
              key={entry.id}
              className="group flex items-center gap-3 px-5 py-2 transition-colors"
              style={{ borderBottom: '1px solid var(--wt-grid)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--wt-bg-surface)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              {/* Change indicator dot */}
              <div
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                style={{
                  background:
                    diff === null
                      ? 'var(--wt-grid)'
                      : diff <= -0.5
                        ? 'rgba(52, 211, 153, 0.15)'
                        : diff >= 0.5
                          ? 'rgba(251, 146, 60, 0.15)'
                          : 'var(--wt-grid)',
                  color:
                    diff === null
                      ? 'var(--wt-muted)'
                      : diff <= -0.5
                        ? 'var(--wt-success)'
                        : diff >= 0.5
                          ? 'var(--wt-warning)'
                          : 'var(--wt-muted)',
                }}
              >
                {diff === null ? '·' : diff <= 0 ? '↓' : '↑'}
              </div>

              {/* Date + note */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--wt-text)' }}>
                    {formatWeight(entry.weight, unit)}
                    <span className="ml-0.5 text-xs font-normal" style={{ color: 'var(--wt-muted)' }}>
                      {unitLabel(unit)}
                    </span>
                  </span>
                  {diff !== null && (
                    <span
                      className="text-xs font-medium"
                      style={{ color: diff <= 0 ? 'var(--wt-success)' : 'var(--wt-warning)' }}
                    >
                      {diff <= 0 ? '' : '+'}
                      {formatWeight(Math.abs(diff), unit)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm" style={{ color: 'var(--wt-muted)' }}>
                    {formatDateLong(entry.date)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--wt-dim)' }}>
                    {daysAgo(entry.date)}
                  </span>
                  {entry.note && (
                    <>
                      <span style={{ color: 'var(--wt-dim)' }}>·</span>
                      <span
                        className="truncate text-sm italic"
                        style={{ color: 'var(--wt-dim)' }}
                      >
                        {entry.note}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Remove button */}
              <button
                onClick={() => onRemove(entry.id)}
                className="shrink-0 rounded-md px-1.5 py-0.5 text-xs opacity-0 transition-all group-hover:opacity-100"
                style={{ color: 'var(--wt-muted)' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = 'var(--wt-warning)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = 'var(--wt-muted)';
                }}
                aria-label="Remove entry"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
