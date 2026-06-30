/**
 * Minimal 5-field cron (minute hour day-of-month month day-of-week) matcher in
 * UTC. Pure and dependency-free so both the scheduler and plan validation can
 * use it. Supports `*`, lists (`,`), ranges (`a-b`), and steps (`*​/n`, `a-b/n`).
 */

const MINUTE_MS = 60_000;
const SCAN_CAP_MINUTES = 366 * 24 * 60; // one year

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
  const fields = {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dom: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dow: parseField(parts[4], 0, 6),
  };
  // A field that matched nothing means the expression can never fire — reject it.
  if (Object.values(fields).some((set) => set.size === 0)) return null;
  return fields;
}

/** True when `schedule` is a usable 5-field cron expression. */
export function isValidCron(schedule: string): boolean {
  return parseCron(schedule) !== null;
}

function isFullSet(set: Set<number>, min: number, max: number): boolean {
  return set.size === max - min + 1;
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
