import { describe, expect, it } from 'vitest';

import { rankMultiAnchorResults } from '../retrieval';
import type { QmdSearchResult } from '../../shared/types';

describe('memory retrieval ranking', () => {
  it('treats remember/told-me joke prompts as conversation recall', () => {
    const sessionResult: QmdSearchResult = {
      path: '/memory/sessions/2026-05-01-session-a.md',
      score: 1,
      content: '## User\nTell me a joke.\n\n## Assistant\nWhy did the function cross the road?',
    };
    const memoryResult: QmdSearchResult = {
      path: '/MEMORY.md',
      score: 1,
      content: '- [fact] The user likes concise answers.',
    };

    const ranked = rankMultiAnchorResults({
      prompt: 'What jokes do you remember telling me?',
      scope: 'all',
      variantResults: [{ query: 'What jokes do you remember telling me?', results: [memoryResult, sessionResult] }],
      limit: 2,
    });

    expect(ranked[0]?.source).toBe('session-transcript');
  });
});
