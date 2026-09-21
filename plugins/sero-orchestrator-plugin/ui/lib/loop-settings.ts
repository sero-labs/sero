/**
 * The Workflow page's settings line, derived in plain words.
 *
 * The page used to carry these as icon chips, which meant the reader had to
 * know what a folder, a lightning bolt and a gauge each stood for before the
 * line said anything. Each value now sits under a label that names it, and the
 * two settings the user can change open from their own value rather than from
 * a separate button beside the line.
 *
 * Pure, so the wording is tested without rendering.
 */

import type { Loop, LoopRunSummary, LoopTrigger } from '../../shared/types';
import { eventSourceWords, scheduleWords } from './loop-activity';
import { formatCost, formatTime } from './format';
import { summarizeLoopUsage } from './usage-summary';

/**
 * How a settings value that opens something is drawn: the value itself, with a
 * dotted underline that turns solid under the pointer. A button beside the line
 * would be a second thing to read before the user knows what the setting
 * currently is. Tailwind gives a button the default cursor, so the pointer is
 * set here.
 */
export const SETTING_VALUE_CLASS =
  'max-w-full cursor-pointer truncate rounded-sm text-left text-[12.5px] leading-tight text-room-text underline decoration-room-text4 decoration-dotted underline-offset-[3px] transition-colors hover:text-room-ink-brand hover:decoration-solid hover:decoration-current focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-room-line-strong';

/** One event or schedule, and everything that narrows when it fires. */
export interface TriggerDetail {
  key: string;
  /** What fires it, in the same words the value uses. */
  source: string;
  /** The narrowing conditions, one plain line each. Empty when nothing narrows it. */
  lines: string[];
}

export interface LoopSettings {
  /** Where the Workflow runs. */
  workspace: string;
  /** What starts it, or "Manually" when nothing does. */
  starts: string;
  /** Per-trigger detail, shown when the user opens the Starts value. */
  triggerDetail: TriggerDetail[];
  /** What the Workflow's background agents run with. */
  context: string;
  /** Lifetime spend against the cost limit, or null when neither exists. */
  spend: string | null;
  /** The total attempt limit, or null when none is set. */
  attempts: string | null;
  /** The wall-clock limit, or null when none is set. */
  time: string | null;
}

/** "a, b or c". */
function joined(words: string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Whether this trigger's events still fire. `scheduleDisabled` never stops them. */
function eventsArmed(trigger: LoopTrigger): boolean {
  return (trigger.type === 'event' || trigger.type === 'hybrid') && !!trigger.eventSource && !trigger.disabled;
}

/** Whether this trigger's schedule still fires. Either flag stops it. */
function scheduleArmed(trigger: LoopTrigger): boolean {
  return (
    (trigger.type === 'cron' || trigger.type === 'hybrid')
    && !!trigger.schedule
    && !trigger.disabled
    && !trigger.scheduleDisabled
  );
}

function workspaceWords(loop: Loop): string {
  const { workspace } = loop;
  // Where it actually ran, once it has: a worktree setting can fall back to the
  // root. "in place" and the resolved type id said the same thing twice more.
  const resolved = loop.runtime.workspace.resolved?.type;
  const worktree = resolved ? resolved === 'managed-worktree' : workspace.useManagedWorktree;
  if (!worktree) return 'Workspace root';
  return workspace.worktreeBranchSource === 'event-pr' ? 'Managed worktree · on the branch from the event' : 'Managed worktree';
}

/** What the background agents run with: the default, or what the user changed. */
export function contextWords(loop: Loop): string {
  const overrides = loop.contextOverrides;
  if (!overrides) return 'Default preset';
  const parts: string[] = [];
  if (overrides.systemPrompt === '') parts.push('No base prompt');
  else if (typeof overrides.systemPrompt === 'string') parts.push('Custom prompt');
  const off = overrides.disabledSkills?.length ?? 0;
  if (off > 0) parts.push(`${off} skill${off === 1 ? '' : 's'} off`);
  return parts.length ? parts.join(' · ') : 'Default preset';
}

/** Each trigger's narrowing conditions, worded rather than shown as JSON. */
function triggerDetail(loop: Loop): TriggerDetail[] {
  return loop.triggers
    .filter((trigger) => eventsArmed(trigger) || trigger.eventSource || trigger.schedule)
    .map((trigger) => {
      const lines: string[] = [];
      const filter = trigger.eventFilter ?? {};
      for (const [field, value] of Object.entries(filter)) {
        lines.push(
          Array.isArray(value)
            ? `Only when ${field} is one of ${value.map((item) => String(item)).join(', ')}`
            : `Only when ${field} is ${String(value)}`,
        );
      }
      if (trigger.eventCondition) lines.push(`Only when: ${trigger.eventCondition}`);
      if (trigger.debounceMs) lines.push(`Waits ${Math.round(trigger.debounceMs / 1000)}s after the last one`);
      if (trigger.maxFires) lines.push(`Fired ${trigger.fireCount} of ${trigger.maxFires} times`);
      if (trigger.nextFireAt && scheduleArmed(trigger)) lines.push(`Next ${formatTime(trigger.nextFireAt)}`);
      if (trigger.disabled) lines.push('Off — nothing fires this');
      else if (trigger.scheduleDisabled && trigger.schedule) lines.push('Its schedule is paused; events still fire it');
      const source = trigger.eventSource
        ? capitalised(eventSourceWords(trigger.eventSource))
        : capitalised(scheduleWords(trigger.schedule ?? ''));
      return { key: trigger.id, source, lines };
    });
}

/** What starts the Workflow, events and schedules read as one sentence. */
function startsWords(loop: Loop): string {
  const events = loop.triggers.filter(eventsArmed).map((trigger) => eventSourceWords(trigger.eventSource!));
  const schedules = loop.triggers.filter(scheduleArmed).map((trigger) => scheduleWords(trigger.schedule!));
  const all = [...events, ...schedules];
  return all.length === 0 ? 'Manually' : capitalised(joined(all));
}

/**
 * The spend the cost limit is tested against, against that limit.
 *
 * Only the two figures the user is deciding on appear here. Tokens and the
 * remaining-budget hint said the same thing three more ways, so the line said
 * $3.13, $4.50 and $1.37 where two numbers answer the question.
 */
function spendWords(loop: Loop, runs: LoopRunSummary[]): string | null {
  const usage = summarizeLoopUsage(loop, runs);
  if (!usage || usage.totalCost === undefined) {
    const cap = loop.limits.maxCostUsd;
    return cap === undefined ? null : `${formatCost(0)} of ${formatCost(cap)}`;
  }
  const spent = `${formatCost(usage.totalCost)}${usage.incomplete ? '+' : ''}`;
  const cap = loop.limits.maxCostUsd;
  return cap === undefined ? spent : `${spent} of ${formatCost(cap)}`;
}

/**
 * Every value the settings line shows.
 *
 * The steps-at-a-time limit is deliberately absent: it changes how fast the
 * Workflow works through its plan, never what the user decides here, and it
 * still applies in `runtime/limits.ts`.
 */
export function loopSettings(loop: Loop, runs: LoopRunSummary[]): LoopSettings {
  const { maxAttemptsTotal, maxWallClockMs } = loop.limits;
  return {
    workspace: workspaceWords(loop),
    starts: startsWords(loop),
    triggerDetail: triggerDetail(loop),
    context: contextWords(loop),
    spend: spendWords(loop, runs),
    attempts: maxAttemptsTotal ? String(maxAttemptsTotal) : null,
    time: maxWallClockMs ? `${Math.round(maxWallClockMs / 60000)} min` : null,
  };
}
