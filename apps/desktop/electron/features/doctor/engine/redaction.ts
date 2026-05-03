/**
 * Last-line-of-defence redaction for serialized doctor reports.
 *
 * Walks any JSON-serialisable value and:
 *   - strips fields whose name matches sensitive patterns
 *   - replaces strings that look like secrets (sk-..., Bearer ..., long
 *     hex digests, github_pat_*) with `[redacted]`
 *   - rewrites absolute paths under `os.homedir()` to `~/...`
 *
 * Checks must still avoid storing sensitive data in `details` — this
 * exists to catch programmer errors, not to make leaks safe.
 */

import os from 'os';

const SENSITIVE_FIELDS = /^(value|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|password|cookie|authorization)$/i;

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]+\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxoxb-[A-Za-z0-9-]+\b/g,
  /\b[A-Fa-f0-9]{32,}\b/g,
];

const homeDir = os.homedir();

function redactString(input: string): string {
  let out = input;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[redacted]');
  }
  if (homeDir && out.includes(homeDir)) {
    out = out.split(homeDir).join('~');
  }
  return out;
}

/**
 * Recursively scrub a value. Returns a new structure; the input is left
 * untouched.
 */
export function scrub<T>(value: T): T {
  return scrubAny(value, new WeakSet()) as T;
}

function scrubAny(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return [];
    seen.add(value);
    return value.map((item) => scrubAny(item, seen));
  }
  if (typeof value === 'object') {
    if (seen.has(value as object)) return {};
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_FIELDS.test(key)) {
        out[key] = '[redacted]';
        continue;
      }
      out[key] = scrubAny(raw, seen);
    }
    return out;
  }
  return value;
}

/** Hash a path for inclusion in reports. Twelve hex chars is plenty. */
export function hashPath(p: string): string {
  // Lazy require so this module remains usable in environments without
  // node:crypto (unit tests in jsdom etc.).
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('sha256').update(p).digest('hex').slice(0, 12);
}
