import { describe, expect, it } from 'vitest';

import { formatCost, formatTokens } from './format-usage';

describe('formatCost', () => {
  it('shows nothing spent as zero', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  it('shows a cost under one cent as less than a cent', () => {
    expect(formatCost(0.004)).toBe('<$0.01');
  });

  it('shows cents for a normal cost', () => {
    expect(formatCost(1.239)).toBe('$1.24');
  });
});

describe('formatTokens', () => {
  it('shows small counts in full', () => {
    expect(formatTokens(999)).toBe('999');
  });

  it('shortens thousands', () => {
    expect(formatTokens(1500)).toBe('1.5k');
  });

  it('shortens millions', () => {
    expect(formatTokens(2_400_000)).toBe('2.4M');
  });
});
