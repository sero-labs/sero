import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildFingerprint,
  clearCache,
  consumeCache,
  mergeCachedResults,
  storeTurnResults,
  type CachedRetrieval,
  type TopicFingerprint,
} from '../../../../../plugins/sero-memory-plugin/extension/prefetch';
import type { RankedMemoryResult } from '../../../../../plugins/sero-memory-plugin/extension/retrieval';

// ── Helper ─────────────────────────────────────────────────────

function makeResult(path: string, content: string): RankedMemoryResult {
  return {
    path,
    content,
    score: 0.9,
    normalizedPath: path,
    source: 'memory',
    scope: 'memory',
    anchorCount: 1,
    matchedQueries: [content.slice(0, 20)],
    finalScore: 0.9,
  };
}

const SESSION = 'test-session-001';

afterEach(() => {
  clearCache(SESSION);
  vi.restoreAllMocks();
});

// ── buildFingerprint ───────────────────────────────────────────

describe('buildFingerprint', () => {
  it('extracts meaningful tokens and strips stop words', () => {
    const fp = buildFingerprint('What is the best authentication strategy for our project?');
    expect(fp.tokens.has('authentication')).toBe(true);
    expect(fp.tokens.has('strategy')).toBe(true);
    expect(fp.tokens.has('project')).toBe(true);
    // Stop words removed
    expect(fp.tokens.has('what')).toBe(false);
    expect(fp.tokens.has('is')).toBe(false);
    expect(fp.tokens.has('the')).toBe(false);
    expect(fp.tokens.has('for')).toBe(false);
    expect(fp.tokens.has('our')).toBe(false);
  });

  it('lowercases everything', () => {
    const fp = buildFingerprint('TypeScript PostgreSQL React');
    expect(fp.tokens.has('typescript')).toBe(true);
    expect(fp.tokens.has('postgresql')).toBe(true);
    expect(fp.tokens.has('react')).toBe(true);
    expect(fp.tokens.has('TypeScript')).toBe(false);
  });

  it('handles empty/short prompts', () => {
    const empty = buildFingerprint('');
    expect(empty.tokens.size).toBe(0);

    const singleWord = buildFingerprint('a');
    // 'a' is a stop word AND single char — filtered
    expect(singleWord.tokens.size).toBe(0);
  });

  it('filters out single-character tokens', () => {
    const fp = buildFingerprint('I use x and y');
    expect(fp.tokens.has('x')).toBe(false);
    expect(fp.tokens.has('y')).toBe(false);
  });
});

// ── storeTurnResults + consumeCache ────────────────────────────

describe('storeTurnResults + consumeCache', () => {
  it('stores and retrieves results for a session', () => {
    const results = [makeResult('MEMORY.md', 'Project uses TypeScript')];
    const fp = buildFingerprint('typescript project');
    storeTurnResults(SESSION, 'typescript project', results, fp);

    const cached = consumeCache(SESSION);
    expect(cached).not.toBeNull();
    expect(cached!.results).toHaveLength(1);
    expect(cached!.prompt).toBe('typescript project');
  });

  it('returns null on first turn (no cache)', () => {
    const cached = consumeCache('brand-new-session');
    expect(cached).toBeNull();
  });

  it('returns null after clearCache', () => {
    const results = [makeResult('MEMORY.md', 'hello')];
    storeTurnResults(SESSION, 'hello', results, buildFingerprint('hello'));

    clearCache(SESSION);
    const cached = consumeCache(SESSION);
    expect(cached).toBeNull();
  });

  it('returns null after 5+ minutes (TTL expiry)', () => {
    const results = [makeResult('MEMORY.md', 'hello')];
    storeTurnResults(SESSION, 'hello', results, buildFingerprint('hello'));

    // Advance time past 5 minutes
    const sixMinutes = 6 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + sixMinutes);

    const cached = consumeCache(SESSION);
    expect(cached).toBeNull();
  });
});

// ── mergeCachedResults ─────────────────────────────────────────

describe('mergeCachedResults', () => {
  const authResult = makeResult('MEMORY.md', 'Auth uses Clerk');
  const dbResult = makeResult('MEMORY.md', 'Database is PostgreSQL');
  const deployResult = makeResult('deploy.md', 'Deploy to fly.io');

  function makeCachedRetrieval(
    prompt: string,
    results: RankedMemoryResult[],
  ): CachedRetrieval {
    return {
      prompt,
      results,
      fingerprint: buildFingerprint(prompt),
      timestamp: Date.now(),
    };
  }

  it('merges cached results when Jaccard overlap ≥ 0.25', () => {
    const fresh = [authResult];
    const cached = makeCachedRetrieval('authentication setup clerk', [dbResult]);
    const currentFp = buildFingerprint('authentication configuration clerk integration');

    const merged = mergeCachedResults(fresh, cached, currentFp, 10);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(authResult); // fresh first
  });

  it('ignores cache when overlap < 0.25 (topic shift)', () => {
    const fresh = [deployResult];
    const cached = makeCachedRetrieval('authentication setup clerk', [authResult]);
    const currentFp = buildFingerprint('kubernetes deployment infrastructure monitoring');

    const merged = mergeCachedResults(fresh, cached, currentFp, 10);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(deployResult);
  });

  it('deduplicates: fresh results take priority over cached', () => {
    const fresh = [authResult];
    const cached = makeCachedRetrieval('auth clerk', [authResult, dbResult]);
    const currentFp = buildFingerprint('auth clerk setup');

    const merged = mergeCachedResults(fresh, cached, currentFp, 10);
    // authResult appears only once (from fresh), dbResult added from cache
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(authResult);
  });

  it('respects the limit parameter', () => {
    const fresh = [authResult];
    const cached = makeCachedRetrieval('auth clerk', [dbResult, deployResult]);
    const currentFp = buildFingerprint('auth clerk setup');

    const merged = mergeCachedResults(fresh, cached, currentFp, 2);
    expect(merged).toHaveLength(2);
  });

  it('returns only fresh results when topics are completely different', () => {
    const fresh = [authResult];
    const cached = makeCachedRetrieval('gardening soil plants flowers', [dbResult]);
    const currentFp = buildFingerprint('typescript react nextjs deployment');

    const merged = mergeCachedResults(fresh, cached, currentFp, 10);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(authResult);
  });

  it('handles empty fresh results with overlapping cache', () => {
    const cached = makeCachedRetrieval('auth clerk', [authResult]);
    const currentFp = buildFingerprint('auth clerk setup');

    const merged = mergeCachedResults([], cached, currentFp, 10);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(authResult);
  });
});
