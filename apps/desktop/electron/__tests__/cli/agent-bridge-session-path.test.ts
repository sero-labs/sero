import { describe, expect, it, vi } from 'vitest';
import type { AgentSession, DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import { installCliAgentBridge } from '@electron/cli/bridges/agent-bridge';
import { getCliSessionBridge } from '@electron/cli/bridges/session-bridge';

function session(path: string): AgentSession {
  return {
    sessionManager: { getSessionFile: () => path },
  } as unknown as AgentSession;
}

describe('CLI session lookup by path', () => {
  it('returns the matching chat instead of another chat in the workspace', () => {
    const entries = [
      ['session-b', { session: session('/sessions/chat-b.jsonl'), loader: {} as DefaultResourceLoader, workspaceId: 'ws-1', lastSessionName: undefined }],
      ['session-a', { session: session('/sessions/chat-a.jsonl'), loader: {} as DefaultResourceLoader, workspaceId: 'ws-1', lastSessionName: undefined }],
    ] satisfies Array<[string, {
      session: AgentSession;
      loader: DefaultResourceLoader;
      workspaceId: string;
      lastSessionName: string | undefined;
    }]>;
    installCliAgentBridge({
      getEntry: (sessionId) => entries.find(([id]) => id === sessionId)?.[1],
      listEntries: () => entries,
      sendEvent: vi.fn(),
    });

    expect(getCliSessionBridge().getSessionForPath?.('ws-1', '/sessions/chat-a.jsonl')?.sessionId)
      .toBe('session-a');
  });
});
