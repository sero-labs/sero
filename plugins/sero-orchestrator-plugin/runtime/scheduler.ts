/**
 * Trigger scheduling (D-12, FR-15/FR-16). Triggers MARK a loop due; they never
 * execute detached prompts. The coordinator still applies lifecycle, readiness,
 * locks, and limits.
 *
 * Cron uses a minimal 5-field matcher (min hour dom month dow) in UTC. Missed
 * cron fires while the workspace was closed collapse into a single catch-up run
 * by advancing nextFireAt past "now" and firing once.
 */

import type { Loop, LoopTrigger } from '../shared/types';

const MINUTE_MS = 60_000;
const SCAN_CAP_MINUTES = 366 * 24 * 60; // one year

// ── Cron parsing ────────────────────────────────────────────

interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
}

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart ? Number(stepPart) : 1;
    let lo = min;
    let hi = max;
    if (rangePart !== '*') {
      const [a, b] = rangePart.split('-');
      lo = Number(a);
      hi = b !== undefined ? Number(b) : Number(a);
    }
    if (Number.isNaN(lo) || Number.isNaN(hi) || Number.isNaN(step) || step < 1) continue;
    for (let v = lo; v <= hi; v += step) {
      if (v >= min && v <= max) values.add(v);
    }
  }
  return values;
}

export function parseCron(schedule: string): CronFields | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dom: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dow: parseField(parts[4], 0, 6),
  };
}

function matches(fields: CronFields, date: Date): boolean {
  const domMatch = fields.dom.has(date.getUTCDate());
  const dowMatch = fields.dow.has(date.getUTCDay());
  const domRestricted = !isFullSet(fields.dom, 1, 31);
  const dowRestricted = !isFullSet(fields.dow, 0, 6);
  // Standard cron: both restricted -> OR; one restricted -> that one; neither -> any.
  let dayOk: boolean;
  if (domRestricted && dowRestricted) dayOk = domMatch || dowMatch;
  else if (domRestricted) dayOk = domMatch;
  else if (dowRestricted) dayOk = dowMatch;
  else dayOk = true;
  return (
    fields.minute.has(date.getUTCMinutes()) &&
    fields.hour.has(date.getUTCHours()) &&
    fields.month.has(date.getUTCMonth() + 1) &&
    dayOk
  );
}

function isFullSet(set: Set<number>, min: number, max: number): boolean {
  return set.size === max - min + 1;
}

/** Next matching minute strictly after `fromMs`, or null if none within a year. */
export function nextFireAfter(schedule: string, fromMs: number): number | null {
  const fields = parseCron(schedule);
  if (!fields) return null;
  let cursor = Math.floor(fromMs / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
  for (let i = 0; i < SCAN_CAP_MINUTES; i += 1) {
    if (matches(fields, new Date(cursor))) return cursor;
    cursor += MINUTE_MS;
  }
  return null;
}

// ── Trigger evaluation ──────────────────────────────────────

function fire(trigger: LoopTrigger, nowMs: number, nextFireAt?: string): LoopTrigger {
  const fireCount = trigger.fireCount + 1;
  const disabled = trigger.maxFires !== undefined && fireCount >= trigger.maxFires;
  return {
    ...trigger,
    fireCount,
    lastFireAt: new Date(nowMs).toISOString(),
    nextFireAt: disabled ? undefined : nextFireAt,
    disabled: disabled || trigger.disabled,
  };
}

/** Marks cron/hybrid triggers due when their nextFireAt has passed. Collapses missed fires. */
export function evaluateCronTriggers(loop: Loop, nowMs: number): { loop: Loop; due: boolean } {
  let due = false;
  const triggers = loop.triggers.map((trigger) => {
    if (trigger.disabled) return trigger;
    if (trigger.type !== 'cron' && trigger.type !== 'hybrid') return trigger;
    if (!trigger.schedule || !trigger.nextFireAt) return trigger;
    if (Date.parse(trigger.nextFireAt) > nowMs) return trigger;
    due = true;
    const next = nextFireAfter(trigger.schedule, nowMs);
    return fire(trigger, nowMs, next !== null ? new Date(next).toISOString() : undefined);
  });
  return { loop: { ...loop, triggers }, due };
}

/** Marks event/hybrid triggers due for an event, respecting debounce + maxFires. */
export function fireEventTriggers(loop: Loop, eventSource: string, nowMs: number): { loop: Loop; due: boolean } {
  let due = false;
  const triggers = loop.triggers.map((trigger) => {
    if (trigger.disabled) return trigger;
    if (trigger.type !== 'event' && trigger.type !== 'hybrid') return trigger;
    if (trigger.eventSource && trigger.eventSource !== eventSource) return trigger;
    if (trigger.debounceMs && trigger.lastFireAt && nowMs - Date.parse(trigger.lastFireAt) < trigger.debounceMs) {
      return trigger;
    }
    due = true;
    return fire(trigger, nowMs, trigger.nextFireAt);
  });
  return { loop: { ...loop, triggers }, due };
}
