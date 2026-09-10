import { useState } from 'react';
import { Button } from '@sero-ai/ui';

import type { ActionOutcome } from '../lib/actions';
import { suggestedCap } from '../lib/view-model';

export interface CapInputProps {
  /** The cap in force. The new cap must be above it. */
  cap: number | null;
  /** Unique per instance: two cap forms can be on the page at once. */
  inputId: string;
  submitLabel: string;
  onRaise(capUsd: number): Promise<ActionOutcome>;
  /** Given the refusal text when the runtime rejects the new cap. */
  onError(text: string): void;
  onDone(): void;
}

/** The one number field that raises a cost cap. Electron has no window.prompt. */
export function CapInput({ cap, inputId, submitLabel, onRaise, onError, onDone }: CapInputProps) {
  const [value, setValue] = useState(String(suggestedCap(cap)));
  const [busy, setBusy] = useState(false);
  const floor = cap ?? 0;
  const next = Number(value);
  const valid = Number.isFinite(next) && next > floor;

  const raise = async () => {
    setBusy(true);
    try {
      const outcome = await onRaise(next);
      if (outcome.ok) onDone();
      else onError(outcome.text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="ar-cap"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || busy) return;
        void raise();
      }}
    >
      <label className="ar-mono" htmlFor={inputId}>$</label>
      <input
        id={inputId}
        type="number"
        min={floor}
        step="any"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="New cap"
      />
      <Button type="submit" size="sm" className="ar-btn ar-btn-solid" disabled={!valid || busy}>{submitLabel}</Button>
    </form>
  );
}
