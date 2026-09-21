/**
 * The facts on a Workflow's state line, worked out apart from how they are
 * drawn: the activity word with when it last ran and how often, the queued
 * events, and the health of the source that feeds it.
 */

import { sessionStartedAt } from '@sero-ai/common';
import type { GithubSourceHealth, Loop, LoopSummary, WebhookSourceHealth } from '../../shared/types';
import { formatRelative } from './format';
import { loopActivity, type LoopActivity } from './loop-activity';
import { sourceHealthChips } from './trigger-summary';

export interface StateLineFacts {
  activity: { state: LoopActivity['state']; word: string; nextStep: LoopActivity['nextStep'] } | null;
  queued: string | null;
  health: ReturnType<typeof sourceHealthChips>;
}

export function stateLineFacts(
  loop: Loop,
  summary: LoopSummary | null,
  runCount: number,
  githubHealth: GithubSourceHealth | null,
  webhookHealth: WebhookSourceHealth | null,
): StateLineFacts | null {
  // A complete Workflow says nothing here: every step card reads Done and the
  // Attempt history fold counts the runs. Any other state is said only here.
  const found = summary ? loopActivity(summary, sessionStartedAt()) : null;
  const activity = found?.state === 'complete' ? null : found;
  const queued = loop.runtime.pendingEvents ?? [];
  const health = sourceHealthChips(loop, githubHealth, webhookHealth);
  if (!activity && queued.length === 0 && health.length === 0) return null;

  // When it last ran and how often, which the list carries in separate columns
  // and this page has nowhere else to put.
  const tail = [
    summary?.lastRunAt ? formatRelative(summary.lastRunAt) : null,
    runCount > 0 ? `${runCount} run${runCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');
  const next = queued[0]?.summary ?? queued[0]?.source;
  return {
    activity: activity
      ? { state: activity.state, word: tail ? `${activity.line} · ${tail}` : activity.line, nextStep: activity.nextStep }
      : null,
    queued: queued.length > 0
      ? `${queued.length} event${queued.length === 1 ? '' : 's'} queued${next ? ` · next: ${next}` : ''}`
      : null,
    health,
  };
}
