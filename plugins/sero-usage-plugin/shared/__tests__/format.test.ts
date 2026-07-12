import { describe, expect, it } from 'vitest';

import { formatCost, formatCount, formatIntervalMinutes, formatRelativeTime, formatTokens } from '../format';

describe('formatCost', () => {
  it('renders zero as a dash, never $0.00', () => {
    expect(formatCost(0)).toBe('-');
  });

  it('applies the tiered precision rules', () => {
    expect(formatCost(0.0042)).toBe('$0.0042');
    expect(formatCost(0.84)).toBe('$0.84');
    expect(formatCost(9.99)).toBe('$9.99');
    expect(formatCost(41.7)).toBe('$41.7');
    expect(formatCost(417.23)).toBe('$417');
  });
});

describe('formatTokens', () => {
  it('renders zero as a dash', () => {
    expect(formatTokens(0)).toBe('-');
  });

  it('applies the tiered magnitude rules', () => {
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(1_234)).toBe('1.2k');
    expect(formatTokens(54_321)).toBe('54k');
    expect(formatTokens(1_400_000)).toBe('1.4M');
    expect(formatTokens(284_000_000)).toBe('284M');
  });
});

describe('formatCount', () => {
  it('renders zero as a dash and locale-formats the rest', () => {
    expect(formatCount(0)).toBe('-');
    expect(formatCount(4148)).toBe((4148).toLocaleString());
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-12T12:00:00').getTime();

  it('covers the just now / minutes / hours / date tiers', () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe('just now');
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(formatRelativeTime(now - 48 * 3_600_000, now)).toBe(
      new Date(now - 48 * 3_600_000).toLocaleDateString(),
    );
  });
});

describe('formatIntervalMinutes', () => {
  it('labels manual and minute/hour intervals', () => {
    expect(formatIntervalMinutes(0)).toBe('Manual');
    expect(formatIntervalMinutes(5)).toBe('5m');
    expect(formatIntervalMinutes(30)).toBe('30m');
    expect(formatIntervalMinutes(60)).toBe('1h');
    expect(formatIntervalMinutes(1440)).toBe('24h');
  });
});
