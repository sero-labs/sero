import { describe, expect, it } from 'vitest';

import {
  noteCliTurnStart,
  noteCliTurnEnd,
  onCliTurnComplete,
  waitForCliTurnStart,
  type CliTurnCompletion,
} from '@electron/cli/bridges/agent-bridge';

// The loop-scoped turn emitter that backs the orchestrator's active-session
// seam. Each test uses a distinct session id because the bridge keeps
// process-wide module state.
describe('CLI turn-lifecycle emitter', () => {
  it('captures the loop turn id at first start and reports it once at loop end', async () => {
    const sessionId = 'turn-life-A';
    const startPromise = waitForCliTurnStart(sessionId, 1000);

    noteCliTurnStart(sessionId); // first LLM turn — opens the loop
    const loopTurnId = await startPromise;
    expect(loopTurnId).toMatch(/^turn-/);

    const completions: CliTurnCompletion[] = [];
    onCliTurnComplete(sessionId, (c) => completions.push(c));

    noteCliTurnStart(sessionId); // second LLM turn in the same loop — no new start
    noteCliTurnEnd(sessionId, 'completed'); // loop ends

    expect(completions).toEqual([{ turnId: loopTurnId, status: 'completed' }]);
  });

  it('propagates an aborted status', () => {
    const sessionId = 'turn-life-B';
    const completions: CliTurnCompletion[] = [];
    onCliTurnComplete(sessionId, (c) => completions.push(c));

    noteCliTurnStart(sessionId);
    noteCliTurnEnd(sessionId, 'aborted');

    expect(completions).toEqual([
      { turnId: expect.stringMatching(/^turn-/), status: 'aborted' },
    ]);
  });

  it('resolves waitForCliTurnStart to null when no turn starts in time', async () => {
    const result = await waitForCliTurnStart('turn-life-C', 5);
    expect(result).toBeNull();
  });

  it('does not emit a completion when no loop was open', () => {
    const sessionId = 'turn-life-D';
    const completions: CliTurnCompletion[] = [];
    onCliTurnComplete(sessionId, (c) => completions.push(c));

    noteCliTurnEnd(sessionId, 'completed');

    expect(completions).toEqual([]);
  });

  it('stops delivering after unsubscribe', () => {
    const sessionId = 'turn-life-E';
    const completions: CliTurnCompletion[] = [];
    const off = onCliTurnComplete(sessionId, (c) => completions.push(c));
    off();

    noteCliTurnStart(sessionId);
    noteCliTurnEnd(sessionId, 'completed');

    expect(completions).toEqual([]);
  });
});
