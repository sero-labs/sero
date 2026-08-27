/**
 * Core Desktop response projection, end to end: real Pi AgentSession →
 * real `subscribeToSession` → real `handleAgentStreamEvent` → renderer state.
 *
 * Happy-path rows and regression rows assert the core Desktop response
 * contract at the real main-process and renderer-store boundaries.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentStreamEvent } from '@/types/ipc';
import { subscribeToSession, type SubscriptionPoolEntry } from '@electron/ipc/agent/core/agent-subscription';
import { openScenarioSession, type ScenarioRun } from './scenario-session';
import { installShortBodyTimeout } from './fixtures/provider-fixture';
import { PROVIDER_SCENARIOS } from './fixtures/provider-scenarios';
import {
  createRendererHarness,
  installManualAnimationFrames,
  runAnimationFrames,
  type RendererHarness,
} from './renderer-projection';

vi.mock('@electron/ipc/editor/debug', () => ({
  logRawEvent: vi.fn(),
  logTurnContext: vi.fn(),
}));

const cliMocks = vi.hoisted(() => ({
  emitTurnComplete: vi.fn(),
  getCliActiveTurnId: vi.fn<() => string | null>(),
  noteCliTurnEnd: vi.fn(),
  noteCliTurnStart: vi.fn(),
}));

vi.mock('@electron/cli/bridges', () => cliMocks);

vi.mock('@/stores/container', () => ({
  useContainerStore: {
    getState: () => ({ setStarting: vi.fn(), setRunning: vi.fn(), setError: vi.fn() }),
  },
}));

vi.mock('@/stores/sessions', () => ({
  useSessionStore: { getState: () => ({ updateSessionName: vi.fn() }) },
}));

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

beforeAll(() => {
  installManualAnimationFrames();
});

beforeEach(() => {
  cliMocks.emitTurnComplete.mockReset();
  cliMocks.getCliActiveTurnId.mockReset().mockReturnValue(null);
});

interface ProjectionRun {
  run: ScenarioRun;
  sent: AgentStreamEvent[];
  renderer: RendererHarness;
}

/**
 * Wires the real subscription to the real renderer handler. Animation
 * frames run after every event; `flushOnlyAfterMessageEnd` instead models
 * slow frames whose one flush lands right after `message_end`.
 */
function project(run: ScenarioRun, options?: { flushOnlyAfterMessageEnd?: boolean }): ProjectionRun {
  const sessionId = 'parity-session';
  const renderer = createRendererHarness(sessionId);
  const sent: AgentStreamEvent[] = [];
  const entry: SubscriptionPoolEntry = {
    session: run.session,
    workspaceId: 'parity-workspace',
    currentAssistantId: null,
    pendingTurnUndoUserMessageId: null,
  };
  const unsubscribe = subscribeToSession(sessionId, run.session, () => entry, (event) => {
    sent.push(event);
    renderer.apply(event);
    if (options?.flushOnlyAfterMessageEnd ? event.type === 'message_end' : true) {
      runAnimationFrames();
    }
  });
  cleanups.push(async () => unsubscribe());
  return { run, sent, renderer };
}

function sentTypes(sent: readonly AgentStreamEvent[]): string[] {
  return sent.map((event) => event.type);
}

describe('core response projection', () => {
  it('reports one failed settlement for the stalled tool-call incident', async () => {
    cliMocks.getCliActiveTurnId.mockReturnValue('turn-provider-error');
    const restore = await installShortBodyTimeout(200);
    cleanups.push(async () => restore());
    const scenario = PROVIDER_SCENARIOS.partialToolTimeout;
    const run = await openScenarioSession(scenario, cleanups, {
      maxRetries: 3,
      retryBaseDelayMs: 25,
    });
    const projection = project(run);
    await run.session.prompt(scenario.prompt);

    const eventTypes = sentTypes(projection.sent);
    const tools = projection.renderer.instance().messages.filter((message) => message.type === 'tool');
    expect(run.fixture.requests).toHaveLength(4);
    expect(eventTypes).not.toContain('tool_start');
    expect(eventTypes).not.toContain('tool_end');
    expect(eventTypes.filter((type) => type === 'agent_end')).toHaveLength(1);
    expect(projection.renderer.instance().error).toMatch(/terminated|timed? out|timeout/i);
    expect(tools).toHaveLength(4);
    expect(tools.every((tool) => tool.state === 'error' && tool.isError)).toBe(true);
    expect(cliMocks.emitTurnComplete).toHaveBeenCalledOnce();
    expect(cliMocks.emitTurnComplete).toHaveBeenCalledWith('parity-session', {
      turnId: 'turn-provider-error',
      status: 'error',
    });
  }, 10000);

  it('shows retry state and keeps the composer busy until recovery', async () => {
    const scenario = PROVIDER_SCENARIOS.retryThenSuccess;
    const run = await openScenarioSession(scenario, cleanups, {
      retryBaseDelayMs: 25,
    });
    const projection = project(run);
    await run.session.prompt(scenario.prompt);

    const timeline = projection.renderer.streamingTimeline;
    expect(sentTypes(projection.sent)).toContain('retry_start');
    expect(sentTypes(projection.sent)).toContain('retry_end');
    expect(projection.renderer.retryTimeline).toContainEqual(expect.objectContaining({
      attempt: 1,
      maxAttempts: 3,
      delayMs: 25,
    }));
    const firstBusy = timeline.indexOf(true);
    const lastBusy = timeline.lastIndexOf(true);
    expect(timeline.slice(firstBusy, lastBusy + 1)).not.toContain(false);
    expect(projection.renderer.instance().isStreaming).toBe(false);
    expect(projection.renderer.instance().retry).toBeNull();
  }, 10000);

  it('applies canonical message_end content without duplicating buffered deltas', async () => {
    const scenario = PROVIDER_SCENARIOS.plainText;
    const run = await openScenarioSession(scenario, cleanups);
    const projection = project(run, { flushOnlyAfterMessageEnd: true });
    await run.session.prompt(scenario.prompt);
    runAnimationFrames();

    expect(projection.renderer.instance().messages).toEqual([
      expect.objectContaining({
        type: 'assistant',
        text: 'Hello from the fixture.',
        isStreaming: false,
      }),
    ]);
  }, 10000);
});
