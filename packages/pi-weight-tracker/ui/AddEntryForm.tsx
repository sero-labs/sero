/**
 * AddEntryForm — inline form to log a new weight entry.
 */

import { useState, useCallback } from 'react';
import type { WeightUnit } from '../shared/types';
import { todayISO, unitLabel } from './utils';

interface AddEntryFormProps {
  unit: WeightUnit;
  onAdd: (weight: number, date: string, note?: string) => void;
}

export function AddEntryForm({ unit, onAdd }: AddEntryFormProps) {
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const w = parseFloat(weight);
      if (isNaN(w) || w <= 0) return;

      // Convert from display unit to kg for storage
      let kg = w;
      if (unit === 'lbs') kg = w / 2.20462;
      if (unit === 'st') kg = w * 6.35029; // treat input as whole stones for simplicity

      onAdd(kg, date, note.trim() || undefined);
      setWeight('');
      setNote('');
      setDate(todayISO());
      setExpanded(false);
    },
    [weight, date, note, unit, onAdd],
  );

  const isValid = !isNaN(parseFloat(weight)) && parseFloat(weight) > 0;

  return (
    <form onSubmit={handleSubmit} className="px-5 py-3" style={{ borderBottom: '1px solid var(--wt-grid)' }}>
      <div className="flex items-center gap-2">
        {/* Weight input */}
        <div className="relative flex-1">
          <input
            type="number"
            step="0.1"
            min="0"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder={`Weight in ${unitLabel(unit)}`}
            className="wt-input w-full pr-10"
          />
          <span
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs uppercase"
            style={{ color: 'var(--wt-muted)' }}
          >
            {unitLabel(unit)}
          </span>
        </div>

        {/* More options toggle */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors"
          style={{
            background: expanded ? 'var(--wt-bg-surface)' : 'transparent',
            color: 'var(--wt-muted)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--wt-bg-surface)';
          }}
          onMouseLeave={(e) => {
            if (!expanded) (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
          title="More options"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
          </svg>
        </button>

        {/* Submit */}
        <button
          type="submit"
          disabled={!isValid}
          className="wt-button shrink-0"
        >
          Log
        </button>
      </div>

      {/* Expanded options */}
      {expanded && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="wt-input flex-1"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="wt-input flex-1"
          />
        </div>
      )}
    </form>
  );
}
