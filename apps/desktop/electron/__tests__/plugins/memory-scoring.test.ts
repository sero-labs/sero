import { describe, expect, it } from 'vitest';

import { entryScore } from '@plugins/sero-memory-plugin/extension/memory-scoring';

// ── entryScore ─────────────────────────────────────────────────

describe('entryScore', () => {
  // Formula: hits × exp(-0.05 × daysSince)
  // Half-life: ln(2) / 0.05 ≈ 13.86 days ≈ 14 days

  it('returns 0 when hits is 0', () => {
    const score = entryScore(0, new Date());
    expect(score).toBe(0);
  });

  it('returns approximately hits for recent access (today)', () => {
    const now = new Date();
    const score = entryScore(5, now);
    // exp(-0.05 * 0) = 1, so score ≈ 5
    expect(score).toBeCloseTo(5, 1);
  });

  it('returns approximately hits × 0.5 for 14-day-old access', () => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000);
    const score = entryScore(10, fourteenDaysAgo);
    // exp(-0.05 * 14) = exp(-0.7) ≈ 0.4966
    expect(score).toBeCloseTo(10 * Math.exp(-0.7), 1);
    // Should be roughly half of hits
    expect(score).toBeGreaterThan(4);
    expect(score).toBeLessThan(6);
  });

  it('returns approximately hits × 0.25 for 28-day-old access', () => {
    const twentyEightDaysAgo = new Date(Date.now() - 28 * 86_400_000);
    const score = entryScore(10, twentyEightDaysAgo);
    // exp(-0.05 * 28) = exp(-1.4) ≈ 0.2466
    expect(score).toBeCloseTo(10 * Math.exp(-1.4), 1);
    expect(score).toBeGreaterThan(2);
    expect(score).toBeLessThan(3);
  });

  it('decays more for older access', () => {
    const recent = entryScore(5, new Date(Date.now() - 1 * 86_400_000));
    const old = entryScore(5, new Date(Date.now() - 30 * 86_400_000));
    expect(recent).toBeGreaterThan(old);
  });

  it('higher hits means higher score at same recency', () => {
    const date = new Date(Date.now() - 7 * 86_400_000);
    const lowHits = entryScore(2, date);
    const highHits = entryScore(10, date);
    expect(highHits).toBeGreaterThan(lowHits);
  });

  it('recent entry with fewer hits can beat old entry with more hits', () => {
    const todayScore = entryScore(3, new Date());
    const oldScore = entryScore(5, new Date(Date.now() - 60 * 86_400_000));
    // 3 * exp(0) = 3 vs 5 * exp(-3) ≈ 0.25
    expect(todayScore).toBeGreaterThan(oldScore);
  });
});
