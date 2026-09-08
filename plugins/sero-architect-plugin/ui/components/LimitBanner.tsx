import { useState } from 'react';
import { Coins } from 'lucide-react';

import type { ProjectRecord } from '../../shared/record';
import type { ActionOutcome } from '../lib/actions';
import { usd } from '../lib/format';
import { CapInput } from './CapInput';

/** Shown only at the cap. Reaching a limit is a stop, never a later phase. */
export function LimitBanner({ record, onRaise }: { record: ProjectRecord; onRaise(capUsd: number): Promise<ActionOutcome> }) {
  const cap = record.budget.capUsd;
  const [error, setError] = useState<string | null>(null);
  if (record.overlay !== 'limited' || cap === null) return null;
  return (
    <div className="ar-limit">
      <span className="ar-ic"><Coins className="ar-i" /></span>
      <div>
        <b>Cap reached: {usd(record.budget.spentUsd)} of {usd(cap)}</b>
        <span>{error ?? 'Architect will not start more work. Current work can continue and may still add cost.'}</span>
      </div>
      <CapInput
        cap={cap}
        inputId="ar-cap-in"
        submitLabel="Raise and resume"
        onRaise={onRaise}
        onError={setError}
        onDone={() => setError(null)}
      />
    </div>
  );
}
