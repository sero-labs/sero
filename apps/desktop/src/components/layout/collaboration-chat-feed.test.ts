import { describe, expect, it } from 'vitest';
import { buildChatFeed } from './collaboration-chat-feed';

describe('buildChatFeed', () => {
  it('renders the pending collaboration query as collaboration UI state while active', () => {
    const feed = buildChatFeed({
      status: 'research',
      strategy: 'standard',
      specialists: [],
      debate: null,
      pendingUserQuery: 'Investigate the regression',
    });

    expect(feed[0]).toEqual({
      kind: 'query',
      key: 'pending-query',
      text: 'Investigate the regression',
    });
  });

  it('stops rendering the pending query after collaboration completes', () => {
    const feed = buildChatFeed({
      status: 'complete',
      strategy: 'standard',
      specialists: [],
      debate: null,
      pendingUserQuery: null,
    });

    expect(feed.some((item) => item.kind === 'query')).toBe(false);
  });

  it('keeps the failed query visible in collaboration UI error state', () => {
    const feed = buildChatFeed({
      status: 'error',
      strategy: 'standard',
      specialists: [],
      debate: null,
      pendingUserQuery: 'Why did the run fail?',
    });

    expect(feed[0]).toEqual({
      kind: 'query',
      key: 'pending-query',
      text: 'Why did the run fail?',
    });
  });
});
