import { describe, expect, it } from 'vitest';
import { buildGraphifyAugmentContext, buildSessionOrientation, extractAugmentCacheKey, extractRelevantReportSnippet } from './augment';
import { createGraphContextState } from './state';

describe('extractRelevantReportSnippet', () => {
  const report = ['# Communities', 'Auth and billing clusters.', '', '# Hooks', 'Lifecycle events for sessions.'].join('\n');

  it('returns the best-matching section', () => {
    const snippet = extractRelevantReportSnippet(report, ['lifecycle'], 500);
    expect(snippet).toContain('# Hooks');
    expect(snippet).not.toContain('Communities');
  });

  it('truncates to maxChars', () => {
    const snippet = extractRelevantReportSnippet(report, ['auth'], 10);
    expect(snippet!.length).toBeLessThanOrEqual(11); // 10 + ellipsis
  });

  it('returns undefined when nothing matches', () => {
    expect(extractRelevantReportSnippet(report, ['zzz'], 500)).toBeUndefined();
  });
});

describe('extractAugmentCacheKey', () => {
  it('keys on tool + pattern/path/command', () => {
    expect(extractAugmentCacheKey({ toolName: 'grep', input: { pattern: 'x' } })).toBe('grep:x');
    expect(extractAugmentCacheKey({ toolName: 'read', input: { path: '/a' } })).toBe('read:/a');
    expect(extractAugmentCacheKey({ toolName: 'bash', input: { command: 'ls' } })).toBe('bash:ls');
    expect(extractAugmentCacheKey({ toolName: 'bash' })).toBe('bash');
  });
});

describe('buildGraphifyAugmentContext', () => {
  it('returns undefined when no graph exists', () => {
    expect(buildGraphifyAugmentContext(createGraphContextState())).toBeUndefined();
  });

  it('includes the suggested question when graph exists', () => {
    const state = createGraphContextState();
    state.graphExists = true;
    expect(buildGraphifyAugmentContext(state, 'How does auth work?')).toContain('How does auth work?');
  });
});

describe('buildSessionOrientation', () => {
  it('lists available artifacts and suggested queries', () => {
    const state = createGraphContextState();
    state.graphExists = true;
    const text = buildSessionOrientation(state, 'Report snippet here', '12 nodes / 20 edges');
    expect(text).toContain('[Graphify active]');
    expect(text).toContain('graphify_query');
    expect(text).toContain('graphify_search');
    expect(text).toContain('Report snippet here');
    expect(text).toContain('12 nodes / 20 edges');
  });
});
