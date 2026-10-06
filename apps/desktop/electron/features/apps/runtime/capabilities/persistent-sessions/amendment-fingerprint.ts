/**
 * A stable fingerprint of the change an amendment asks for: its subjects with
 * their policies and its retire list. Subject order, key order and repeated
 * retire names do not change it. The reason, the approval mode and the
 * expected revision are not part of the change.
 */

import type { PersistentSessionGrantAmendment } from '@sero-ai/common';

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function amendmentFingerprint(amendment: PersistentSessionGrantAmendment): string {
  return canonicalJson({
    subjects: amendment.subjects ?? {},
    retire: [...new Set(amendment.retire ?? [])].sort(),
  });
}
