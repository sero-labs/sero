/** Hit and false-hit rates of memory recall at a score threshold. */

export interface ScoredQuery {
  query: string;
  expected: string[];
  scores: Array<{ id: string; score: number }>;
}

export interface ThresholdRate {
  threshold: number;
  hitRate: number;
  falseHitRate: number;
}

export function memorySearchThresholds(): number[] {
  return [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9];
}

export function rateAtThreshold(queries: ScoredQuery[], threshold: number): ThresholdRate {
  let expectedTotal = 0;
  let hits = 0;
  let queriesWithFalseHit = 0;
  for (const { expected, scores } of queries) {
    const returned = new Set(scores.filter((s) => s.score >= threshold).map((s) => s.id));
    expectedTotal += expected.length;
    hits += expected.filter((id) => returned.has(id)).length;
    if ([...returned].some((id) => !expected.includes(id))) queriesWithFalseHit += 1;
  }
  return {
    threshold,
    hitRate: expectedTotal === 0 ? 1 : hits / expectedTotal,
    falseHitRate: queries.length === 0 ? 0 : queriesWithFalseHit / queries.length,
  };
}
