// Cron schedule matching for the Orchestrator scheduler. Copied — deliberately,
// not imported — from the cron plugin's parser (D-02): Orchestrator owns its own
// scheduling adapter and must not take a runtime dependency on the cron plugin.
// Extraction to a shared util is deferred until a second consumer needs it.
//
// Standard 5-field cron ("min hour dom month dow") with ranges (1-5), steps
// (*/5), lists (1,3,5), and wildcards. Matching uses LOCAL time, mirroring the
// cron plugin so identical expressions behave identically across both surfaces.

const MINUTE_MS = 60_000;

/** A 5-field cron expression compiled once into per-field value sets. */
export interface CompiledCron {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
}

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    const [rangeStr, stepStr] = part.split('/');
    const step = stepStr ? parseInt(stepStr, 10) : 1;
    if (step < 1 || Number.isNaN(step)) {
      throw new Error(`Invalid step "${stepStr}" in field "${field}"`);
    }

    let lo: number;
    let hi: number;
    if (rangeStr === '*') {
      lo = min;
      hi = max;
    } else if (rangeStr.includes('-')) {
      const [a, b] = rangeStr.split('-');
      lo = parseInt(a, 10);
      hi = parseInt(b, 10);
    } else {
      lo = parseInt(rangeStr, 10);
      hi = lo;
    }

    if (Number.isNaN(lo) || Number.isNaN(hi)) {
      throw new Error(`Invalid value in field "${field}"`);
    }
    if (lo < min || hi > max) {
      throw new Error(`Value out of range in "${field}" (allowed ${min}-${max})`);
    }
    for (let i = lo; i <= hi; i += step) values.add(i);
  }
  return values;
}

/** Compile a 5-field cron expression; throws on a malformed expression. */
export function compileCron(expr: string): CompiledCron {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression (need 5 fields): "${expr}"`);
  }
  return {
    minutes: parseField(fields[0], 0, 59),
    hours: parseField(fields[1], 0, 23),
    daysOfMonth: parseField(fields[2], 1, 31),
    months: parseField(fields[3], 1, 12),
    daysOfWeek: parseField(fields[4], 0, 6),
  };
}

/** Does `date` (to local-minute precision) satisfy the compiled schedule? */
export function matchesCompiled(cron: CompiledCron, date: Date): boolean {
  return (
    cron.minutes.has(date.getMinutes()) &&
    cron.hours.has(date.getHours()) &&
    cron.daysOfMonth.has(date.getDate()) &&
    cron.months.has(date.getMonth() + 1) &&
    cron.daysOfWeek.has(date.getDay())
  );
}

/** Convenience matcher (compiles then matches); throws on a malformed expression. */
export function matchesCron(expr: string, date: Date): boolean {
  return matchesCompiled(compileCron(expr), date);
}

/** Returns null when `expr` is a valid 5-field cron, else the error message. */
export function validateCron(expr: string): string | null {
  try {
    compileCron(expr);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Invalid cron expression';
  }
}

/** Forward-scan cap (~1 year) so a never-matching schedule still terminates. */
export const DEFAULT_HORIZON_MINUTES = 366 * 24 * 60;

/**
 * The first scheduled minute STRICTLY after `from`, or null if none falls within
 * `horizonMinutes`. Scans minute-by-minute from the next whole minute; realistic
 * schedules match within a day, so the cap only bounds pathological expressions.
 */
export function nextFireAfter(
  cron: CompiledCron,
  from: Date,
  horizonMinutes: number = DEFAULT_HORIZON_MINUTES,
): Date | null {
  const cursor = new Date(Math.floor(from.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS);
  for (let i = 0; i < horizonMinutes; i += 1) {
    if (matchesCompiled(cron, cursor)) return new Date(cursor.getTime());
    cursor.setTime(cursor.getTime() + MINUTE_MS);
  }
  return null;
}
