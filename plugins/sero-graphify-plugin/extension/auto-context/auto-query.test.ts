import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { runAutoQuery } from './auto-query';
import type { GraphifyIntent } from './intent';

const FIXTURE = path.join(__dirname, '..', '..', 'shared', 'query-engine', 'fixtures', 'small-graph.json');

const intent = (suggestedQuestion?: string): GraphifyIntent => ({
  kind: 'broad-search',
  confidence: 0.8,
  reason: 'test',
  suggestedQuestion,
  cacheKey: 'k',
});

describe('runAutoQuery', () => {
  it('answers from the graph within maxChars', async () => {
    const result = await runAutoQuery(FIXTURE, intent('how does AuthService work'), 800, 500);
    expect(result).toBeTruthy();
    expect(result!).toContain('AuthService');
    expect(result!.length).toBeLessThanOrEqual(501);
  });

  it('returns undefined without a suggested question', async () => {
    expect(await runAutoQuery(FIXTURE, intent(undefined), 800, 500)).toBeUndefined();
  });

  it('returns undefined when the graph is missing', async () => {
    expect(await runAutoQuery('/nonexistent/graph.json', intent('anything'), 800, 500)).toBeUndefined();
  });

  it('returns undefined for no-match questions', async () => {
    expect(await runAutoQuery(FIXTURE, intent('zzz qqq www'), 800, 500)).toBeUndefined();
  });
});
