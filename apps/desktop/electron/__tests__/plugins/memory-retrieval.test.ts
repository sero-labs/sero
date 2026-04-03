import { describe, expect, it } from 'vitest';

import {
  buildPromptVariants,
  formatRankedResults,
  normalizeSearchScope,
  rankMultiAnchorResults,
} from '../../../../../plugins/sero-memory-plugin/extension/retrieval';

describe('memory retrieval helpers', () => {
  it('normalizes unsupported scopes to all', () => {
    expect(normalizeSearchScope('memory')).toBe('memory');
    expect(normalizeSearchScope('sessions')).toBe('sessions');
    expect(normalizeSearchScope('bogus')).toBe('all');
    expect(normalizeSearchScope()).toBe('all');
  });

  it('builds expanded prompt variants for abbreviations', () => {
    const variants = buildPromptVariants('What did we discuss about TS auth db UI?');

    expect(variants[0]).toContain('What did we discuss');
    expect(variants.some((variant) => variant.includes('typescript'))).toBe(true);
    expect(variants.some((variant) => variant.includes('authentication'))).toBe(true);
    expect(variants.some((variant) => variant.includes('database'))).toBe(true);
  });

  it('prefers transcript hits for conversation recall prompts', () => {
    const results = rankMultiAnchorResults({
      prompt: 'What did we discuss about auth last week?',
      scope: 'all',
      limit: 3,
      variantResults: [{
        query: 'auth last week',
        results: [
          {
            path: 'memory/daily/2026-04-01.md',
            score: 0.9,
            content: '<!-- source: daily-summary -->\n<!-- session-id: abc123 -->\nSummary of auth discussion',
          },
          {
            path: 'memory/sessions/2026-04-01-abc123.md',
            score: 0.85,
            content: '<!-- source: transcript -->\n<!-- session-id: abc123 -->\nUser asked about auth migration',
          },
        ],
      }],
    });

    expect(results[0]?.source).toBe('session-transcript');
    expect(results[0]?.sessionId).toBe('abc123');
  });

  it('prefers daily summaries for broad state recall prompts', () => {
    const results = rankMultiAnchorResults({
      prompt: 'What do we know about auth rollout status?',
      scope: 'all',
      limit: 3,
      variantResults: [{
        query: 'auth rollout status',
        results: [
          {
            path: 'memory/daily/2026-04-01.md',
            score: 0.9,
            content: '<!-- source: daily-summary -->\n<!-- session-id: abc123 -->\nSummary of auth discussion',
          },
          {
            path: 'memory/sessions/2026-04-01-abc123.md',
            score: 0.85,
            content: '<!-- source: transcript -->\n<!-- session-id: abc123 -->\nUser asked about auth migration',
          },
        ],
      }],
    });

    expect(results[0]?.source).toBe('daily-summary');
    expect(results[0]?.sessionId).toBe('abc123');
  });

  it('formats transcript hits as excerpts instead of full bodies', () => {
    const repeated = Array.from({ length: 80 }, (_, index) => `Line ${index} about kanban follow-up work`).join('\n');
    const results = rankMultiAnchorResults({
      prompt: 'kanban follow-up',
      scope: 'sessions',
      limit: 1,
      variantResults: [{
        query: 'kanban follow-up',
        results: [{
          path: 'memory/sessions/2026-04-01-abc123.md',
          score: 0.9,
          content: [
            '# Session 2026-04-01 (abc123)',
            '',
            '<!-- source: transcript -->',
            '<!-- session-id: abc123 -->',
            '',
            repeated,
          ].join('\n'),
        }],
      }],
    });

    const formatted = formatRankedResults(results);
    expect(formatted).toContain('Session transcript');
    expect(formatted).toContain('kanban');
    expect(formatted.length).toBeLessThan(900);
    expect(formatted).not.toContain('Line 79 about kanban follow-up work');
  });
});
