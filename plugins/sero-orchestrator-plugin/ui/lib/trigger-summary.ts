/**
 * Pure formatting for event-trigger chips, the run "fired by" label, and the
 * source-health line (Living Loops, spec 12). No React so it unit-tests
 * directly; the components render what these return.
 */

import type {
  GithubSourceHealth,
  Loop,
  LoopRunSummary,
  LoopTrigger,
  WebhookSourceHealth,
} from '../../shared/types';
import { formatTime } from './format';

export interface EventTriggerChip {
  key: string;
  /** Chip text, e.g. "github:ci-failed" (with " · off" when disabled). */
  label: string;
  /** Hover detail: filter, condition, debounce, enabled state. */
  title: string;
  disabled: boolean;
}

/** One chip per event/hybrid trigger with a source; detail lives in the title. */
export function eventTriggerChips(triggers: LoopTrigger[]): EventTriggerChip[] {
  return triggers
    .filter((t) => (t.type === 'event' || t.type === 'hybrid') && t.eventSource)
    .map((t) => {
      const parts = [`Fires on ${t.eventSource}`];
      if (t.eventFilter && Object.keys(t.eventFilter).length > 0) parts.push(`filter ${JSON.stringify(t.eventFilter)}`);
      if (t.eventCondition) parts.push(`when: ${t.eventCondition}`);
      if (t.debounceMs) parts.push(`debounce ${Math.round(t.debounceMs / 1000)}s`);
      parts.push(t.disabled ? 'disabled' : 'enabled');
      return {
        key: t.id,
        label: `${t.eventSource}${t.disabled ? ' · off' : ''}`,
        title: parts.join(' · '),
        disabled: Boolean(t.disabled),
      };
    });
}

/** Label for the run-history "fired by" chip; null for manual/cron runs. */
export function firedByLabel(run: LoopRunSummary): string | null {
  if (!run.firedBy) return null;
  const depth = run.firedBy.chainDepth ? ` · chain ${run.firedBy.chainDepth}` : '';
  return `${run.firedBy.source}${depth}`;
}

/**
 * The compact source-health chips for a loop — only for namespaces one of its
 * enabled triggers actually uses, and only when there is a fact to show.
 */
export function sourceHealthChips(
  loop: Loop,
  github: GithubSourceHealth | null,
  webhook: WebhookSourceHealth | null,
): { key: string; label: string }[] {
  const uses = (namespace: string) =>
    loop.triggers.some((t) => !t.disabled && t.eventSource?.startsWith(`${namespace}:`));
  const chips: { key: string; label: string }[] = [];
  if (uses('github') && github?.lastPolledAt) {
    chips.push({
      key: 'github',
      label: github.throttledUntil
        ? `GitHub · backing off until ${formatTime(github.throttledUntil)}`
        : `GitHub · checked ${formatTime(github.lastPolledAt)}`,
    });
  }
  if (uses('webhook') && webhook?.port) {
    chips.push({ key: 'webhook', label: `Hooks · 127.0.0.1:${webhook.port}` });
  }
  return chips;
}
