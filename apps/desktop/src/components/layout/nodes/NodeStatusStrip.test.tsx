// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentNodeInfo, AgentNodeConnectionState } from '@/types/agent-node';
import { NodeStatusStrip } from './NodeStatusStrip';
import { NODE_SAFETY_WARNING } from './EnrolNodeDialog';

const expected: Record<Exclude<AgentNodeConnectionState, 'connected'>, string> = {
  reconnecting: 'Your task is still running on the node. Nothing is lost.',
  unreachable: 'Last seen 4 minutes ago.',
  restarted: 'The turn stopped. Your session and every finished step are intact.',
  revoked: 'Running tasks were cancelled. The sessions are still there.',
  'version-skew': 'You can still send and see replies in open sessions. Lists, replay, login and settings need an update.',
};

describe('NodeStatusStrip', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:04:00Z')); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });

  it('renders no strip while connected and the exact copy for all other states', async () => {
    const base: AgentNodeInfo = { id: 'n', name: 'Spark', address: 'x', fingerprint: 'f', tools: [], workspaces: [], connectionState: 'connected', lastSeen: '2026-01-01T00:00:00Z' };
    await act(async () => root.render(<NodeStatusStrip node={base} onRetry={vi.fn()} />));
    expect(container.textContent).toBe('');
    for (const [connectionState, copy] of Object.entries(expected)) {
      await act(async () => root.render(<NodeStatusStrip node={{ ...base, connectionState: connectionState as AgentNodeConnectionState }} onRetry={vi.fn()} />));
      expect(container.textContent).toContain(copy);
    }
  });

  it('keeps the enrolment confirmation warning exact', () => {
    expect(NODE_SAFETY_WARNING).toBe("Work you send this node runs with the node's credentials. A task that reads untrusted text can reach them.");
  });
});
