/**
 * What the Workflow is doing, in the same words and the same glyph its row on
 * the Workflows list uses, with the two facts that explain a Workflow which is
 * armed but not running: how many events are waiting, and whether the source
 * that feeds it is answering.
 *
 * Those two used to be chips on the settings line, beside settings the user
 * chose. They are not settings. They say why nothing has happened yet, which
 * belongs with the state, and they stay grey because neither asks the user for
 * anything.
 */

import type { GithubSourceHealth, LoopSummary, Loop, WebhookSourceHealth } from '../../shared/types';
import { stateLineFacts } from '../lib/loop-state-line';
import { useLiveCall } from '../lib/use-live-call';
import { ActivityWord } from './ActivityWord';
import { LiveCallPopover } from './LiveCallPopover';

export function LoopStateLine({
  loop,
  summary,
  runCount = 0,
  githubHealth = null,
  webhookHealth = null,
}: {
  loop: Loop;
  /** The watched index entry. Null while the index has not caught up with a new Workflow. */
  summary: LoopSummary | null;
  /** How many times it has run. The list shows this in its own column. */
  runCount?: number;
  githubHealth?: GithubSourceHealth | null;
  webhookHealth?: WebhookSourceHealth | null;
}) {
  const facts = stateLineFacts(loop, summary, runCount, githubHealth, webhookHealth);
  // A newly arrived event is checked before the Workflow decides anything, and
  // the state line is where the reader is already looking. It names the event,
  // so the wait says what it is about rather than only that something runs.
  const checking = useLiveCall({ kind: 'event', loopId: loop.id });
  if (!facts && !checking) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-room-text3">
      {facts?.activity && <ActivityWord {...facts.activity} />}
      {facts?.queued && <span>{facts.queued}</span>}
      {facts?.health.map((chip) => (
        <span key={chip.key}>{chip.label}</span>
      ))}
      {checking && (
        <span className="flex items-center gap-1.5">
          <span>checking a new event: {checking.label}</span>
          <LiveCallPopover runId={checking.runId} label={`checking a new event: ${checking.label ?? ''}`} busy />
        </span>
      )}
    </p>
  );
}
