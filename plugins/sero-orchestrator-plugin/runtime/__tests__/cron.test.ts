import { describe, expect, it } from 'vitest';
import { isValidCron, nextFireAfter, parseCron } from '../cron';

describe('isValidCron', () => {
  it('accepts valid 5-field expressions', () => {
    expect(isValidCron('*/10 * * * *')).toBe(true);
    expect(isValidCron('0 9 * * 1-5')).toBe(true);
  });

  it('rejects natural language, wrong field counts, and out-of-range fields', () => {
    expect(isValidCron('every 10 minutes')).toBe(false);
    expect(isValidCron('* * * *')).toBe(false); // four fields
    expect(isValidCron('99 * * * *')).toBe(false); // minute out of range → never fires
  });

  it('keeps parseCron/nextFireAfter behaviour', () => {
    expect(parseCron('bad')).toBeNull();
    expect(nextFireAfter('0 * * * *', Date.parse('2026-06-22T10:15:00.000Z'))).toBe(Date.parse('2026-06-22T11:00:00.000Z'));
  });
});
