import { describe, expect, it } from 'vitest';
import { buildSearchPrompt, extractSourceUrls } from '../gemini-search-format';

describe('gemini search formatting helpers', () => {
  it('includes recency and domain filters in Gemini Web prompts', () => {
    const prompt = buildSearchPrompt('latest Sero release notes', {
      recencyFilter: 'week',
      domainFilter: ['sero.dev', '-reddit.com'],
    });

    expect(prompt).toContain('Question: latest Sero release notes');
    expect(prompt).toContain('Only include results from the past week.');
    expect(prompt).toContain('Only cite sources from: sero.dev');
    expect(prompt).toContain('Do not cite sources from: reddit.com');
  });

  it('deduplicates repeated markdown source links', () => {
    const markdown = [
      'Answer with [Sero docs](https://sero.dev/docs).',
      'Repeat [Sero docs](https://sero.dev/docs).',
      'Also cite [GitHub](https://github.com/sero-ai/sero).',
    ].join(' ');

    expect(extractSourceUrls(markdown)).toEqual([
      { title: 'Sero docs', url: 'https://sero.dev/docs', snippet: '' },
      { title: 'GitHub', url: 'https://github.com/sero-ai/sero', snippet: '' },
    ]);
  });
});
