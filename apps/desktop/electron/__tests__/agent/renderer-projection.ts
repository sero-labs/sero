/**
 * Renderer-store harness: applies Sero AgentStreamEvents through the real
 * `handleAgentStreamEvent`, with the production flush logic and a manual
 * animation-frame queue so delta batching is deterministic in tests.
 */

import { vi } from 'vitest';
import type { AgentStreamEvent } from '@/types/ipc';
import type { AgentInstance, AgentRetryState, AgentState } from '@/stores/agent-types';
import { applyBufferedDeltas, handleAgentStreamEvent } from '@/stores/agent-utils';

const rafQueue: Array<() => void> = [];

export function installManualAnimationFrames(): void {
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    rafQueue.push(callback);
    return rafQueue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    rafQueue.length = 0;
  });
}

export function runAnimationFrames(): void {
  while (rafQueue.length > 0) rafQueue.shift()?.();
}

export interface RendererHarness {
  /** Apply one event through the real renderer handler. */
  apply(event: AgentStreamEvent): void;
  instance(): AgentInstance;
  /** isStreaming value observed after each applied event. */
  streamingTimeline: boolean[];
  retryTimeline: Array<AgentRetryState | null>;
}

export function createRendererHarness(sessionId: string): RendererHarness {
  const instance: AgentInstance = {
    sessionId,
    sessionPath: '/tmp/parity-session',
    workspaceId: 'parity-workspace',
    messages: [],
    olderCursor: null,
    loadingOlderTurns: false,
    isStreaming: false,
    retry: null,
    error: null,
    commands: [],
    modelState: null,
  };
  let state = {
    agents: { [sessionId]: instance },
    composerPrefills: {},
    focusedSessionId: null,
    showThinkingBlocks: true,
    showMemoryBlocks: true,
  } as unknown as AgentState;

  const set = (updater: (current: AgentState) => AgentState | Partial<AgentState>) => {
    state = { ...state, ...updater(state) };
  };
  const get = () => state;

  const flushDeltas = () => applyBufferedDeltas(set);

  const streamingTimeline: boolean[] = [];
  const retryTimeline: Array<AgentRetryState | null> = [];

  return {
    apply: (event) => {
      handleAgentStreamEvent(event, set, get, flushDeltas);
      streamingTimeline.push(get().agents[sessionId]?.isStreaming ?? false);
      retryTimeline.push(get().agents[sessionId]?.retry ?? null);
    },
    instance: () => get().agents[sessionId],
    streamingTimeline,
    retryTimeline,
  };
}
