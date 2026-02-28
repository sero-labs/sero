/**
 * Cron expression parser, validator, and human-readable formatter.
 *
 * Supports standard 5-field cron: min hour dom month dow
 * Features: ranges (1-5), steps, lists (1,3,5), wildcards
 *
 * Shared between the Pi extension and the web UI.
 */

// ── Field parser ──────────────────────────────────────────────

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    const [rangeStr, stepStr] = part.split('/');
    const step = stepStr ? parseInt(stepStr, 10) : 1;

    if (step < 1 || isNaN(step)) {
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

    if (isNaN(lo) || isNaN(hi)) {
      throw new Error(`Invalid value in field "${field}"`);
    }
    if (lo < min || hi > max) {
      throw new Error(`Value out of range in "${field}" (allowed ${min}-${max})`);
    }

    for (let i = lo; i <= hi; i += step) {
      values.add(i);
    }
  }

  return values;
}

// ── Matcher ───────────────────────────────────────────────────

export function matchesCron(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression (need 5 fields): "${expr}"`);
  }

  return (
    parseField(fields[0], 0, 59).has(date.getMinutes()) &&
    parseField(fields[1], 0, 23).has(date.getHours()) &&
    parseField(fields[2], 1, 31).has(date.getDate()) &&
    parseField(fields[3], 1, 12).has(date.getMonth() + 1) &&
    parseField(fields[4], 0, 6).has(date.getDay())
  );
}

// ── Validator ─────────────────────────────────────────────────

/** Returns null if valid, error message if invalid. */
export function validateCron(expr: string): string | null {
  try {
    matchesCron(expr, new Date());
    return null;
  } catch (err: unknown) {
    return err instanceof Error ? err.message : 'Invalid cron expression';
  }
}

// ── Human-readable format ─────────────────────────────────────

const DOW_NAMES: Record<string, string> = {
  '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed',
  '4': 'Thu', '5': 'Fri', '6': 'Sat',
};

export function cronToHuman(expr: string): string {
  const parts = expr.split(/\s+/);
  if (parts.length !== 5) return expr;

  const [min, hour, dom, month, dow] = parts;

  if (expr === '* * * * *') return 'Every minute';
  if (min.startsWith('*/')) return `Every ${min.slice(2)} min`;

  const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;

  if (hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return `Minute ${min}, every hour`;
  }
  if (dom === '*' && month === '*' && dow === '*') return `Daily at ${time}`;
  if (dom === '*' && month === '*' && dow === '1-5') return `Weekdays at ${time}`;
  if (dom === '*' && month === '*' && dow === '0,6') return `Weekends at ${time}`;
  if (dom === '1' && month === '*' && dow === '*') return `Monthly 1st at ${time}`;
  if (dom === '*' && month === '*' && DOW_NAMES[dow]) {
    return `${DOW_NAMES[dow]} at ${time}`;
  }

  return expr;
}
