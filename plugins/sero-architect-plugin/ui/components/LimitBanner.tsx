import { useState } from 'react';
import { Button } from '@sero-ai/ui';
import { Coins } from 'lucide-react';

import type { ProjectRecord } from '../../shared/record';
import type { ActionOutcome } from '../lib/actions';
import { usd } from '../lib/format';
import { suggestedCap } from '../lib/view-model';

/** Shown only at the cap. Reaching a limit is a stop, never a later phase. */
export function LimitBanner({ record, onRaise }: { record: ProjectRecord; onRaise(capUsd: number): Promise<ActionOutcome> }) {
  const cap = record.budget.capUsd;
  const [value, setValue] = useState(String(suggestedCap(cap)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (record.overlay !== 'limited' || cap === null) return null;
  const next = Number(value);
  const valid = Number.isFinite(next) && next > cap;
  const raise = async () => {
    setBusy(true);
    try {
      const outcome = await onRaise(next);
      if (!outcome.ok) setError(outcome.text);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="ar-limit"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || busy) return;
        void raise();
      }}
    >
      <span className="ar-ic"><Coins className="ar-i" /></span>
      <div>
        <b>Cap reached: {usd(record.budget.spentUsd)} of {usd(cap)}</b>
        <span>{error ?? 'Reaching a limit is not completion. Raise the cap to wake the Architect and allow new dispatches.'}</span>
      </div>
      <div className="ar-cap">
        <label className="ar-mono" htmlFor="ar-cap-in">$</label>
        <input id="ar-cap-in" type="number" min={cap + 1} value={value} onChange={(event) => setValue(event.target.value)} aria-label="New cap" />
        <Button type="submit" size="sm" className="ar-btn ar-btn-solid" disabled={!valid || busy}>Raise and resume</Button>
      </div>
    </form>
  );
}
