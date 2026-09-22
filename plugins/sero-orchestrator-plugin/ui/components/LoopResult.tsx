/**
 * The one row a Workflow's ending leads with (prototype frame 1).
 *
 * Every ending has one. A completed Workflow prints the reason its own run
 * recorded; a stopped one prints why it stopped. It replaces a card that led
 * with `Stopped (<status>):` — a status word the state line above already says,
 * which is what made the same ending read twice in different words.
 *
 * The reason is the record's. Where the record holds none, the row says that
 * rather than filling the space with a sentence that sounds like one.
 *
 * Its own module so the preview harness can render the real row beside the
 * drawing; a preview that re-draws a component proves nothing about it.
 */

import type { Loop } from '../../shared/types';

export function LoopResult({ loop }: { loop: Loop }) {
  const { runtime } = loop;
  const block = runtime.block;
  const ended = runtime.completion !== undefined || block !== undefined || loop.status === 'complete';
  if (!ended) return null;
  const complete = runtime.completion?.status === 'complete';
  const reason = runtime.completion?.reason ?? block?.reason ?? 'The Workflow ended without recording a reason.';
  return (
    <div
      data-result={complete ? 'complete' : 'stopped'}
      className={`rounded-[9px] border px-3.5 py-3 ${complete ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-destructive/40 bg-destructive/[0.05]'}`}
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
        <dt className="text-xs uppercase tracking-wide text-room-text3">Result</dt>
        <dd className="text-[13px] text-room-text">{reason}</dd>
      </dl>
    </div>
  );
}
