/**
 * A time range names its dates once it crosses a day, so a five-day run never
 * reads like a few hours.
 */

import { describe, expect, it } from 'vitest';
import { span } from '../lib/inspector-format';

const local = (day: number, hour: number, minute: number): string => new Date(2026, 8, day, hour, minute).toISOString();

describe('span', () => {
  it('shows clock times alone within one day', () => {
    expect(span(local(16, 9, 5), local(16, 22, 28))).toBe('09:05 → 22:28');
  });

  it('shows both dates when the range crosses a day', () => {
    expect(span(local(16, 23, 4), local(21, 22, 28))).toBe('16 Sep 23:04 → 21 Sep 22:28');
  });

  it('says a range still running is open', () => {
    expect(span(local(16, 23, 4), null)).toBe('23:04 → open');
  });
});
