import { describe, expect, it } from 'vitest';
import { instantiate } from '../library';
import { toSharedDefinition } from '../../shared/library';
import { loopParentSessionId } from '../../shared/ids';
import { DEFAULT_LIMITS, DEFAULT_LOG_POLICY } from '../../shared/defaults';
import type { LoopLibraryLink, SharedLoopDefinition } from '../../shared/types';
import { createFakeHost } from './fake-host';

function definition(): SharedLoopDefinition {
  return {
    schemaVersion: 1,
    prompt: 'the prompt',
    title: 'Triage PRs',
    summary: 'Triage open PRs daily',
    plan: {
      schemaVersion: 1,
      revision: 0,
      objective: 'Triage',
      steps: [
        { id: 'a', title: 'A', instructions: 'do a', execution: { type: 'background-agent', model: 'HIGH', tools: ['grep'] } },
        { id: 'b', title: 'B', instructions: 'do b', dependsOn: ['a'], execution: { type: 'model', model: 'LOW' } },
      ],
    },
    triggers: [{ type: 'cron', schedule: '0 9 * * *', maxFires: 5 }],
    limits: { ...DEFAULT_LIMITS },
    logPolicy: { ...DEFAULT_LOG_POLICY },
    contextOverrides: { systemPrompt: 'custom', disabledTools: ['bash'] },
  };
}

const LINK: LoopLibraryLink = { entryId: 'entry_1', version: 3, syncedAt: '2026-06-27T00:00:00.000Z' };

describe('instantiate', () => {
  it('mints a fresh draft loop in the host workspace linked to the version', () => {
    const host = createFakeHost({ workspaceId: 'ws-9' });
    const loop = instantiate(host, definition(), LINK);

    expect(loop.id).toMatch(/^loop_/);
    expect(loop.workspaceId).toBe('ws-9');
    expect(loop.status).toBe('draft');
    expect(loop.title).toBe('Triage PRs');
    expect(loop.prompt).toBe('the prompt');
    expect(loop.libraryLink).toEqual(LINK);
    expect(loop.runtime.parentSessionId).toBe(loopParentSessionId('ws-9', loop.id));
  });

  it('starts with empty runtime and history', () => {
    const host = createFakeHost();
    const loop = instantiate(host, definition(), LINK);

    expect(loop.runtime.variables).toEqual({});
    expect(loop.runtime.stepStates).toEqual({});
    expect(loop.runs).toEqual([]);
    expect(loop.revisions).toEqual([]);
    expect(loop.warnings).toEqual([]);
  });

  it('materializes triggers with new ids and zeroed counters', () => {
    const host = createFakeHost({ workspaceId: 'ws-9' });
    const loop = instantiate(host, definition(), LINK);

    expect(loop.triggers).toHaveLength(1);
    const [t] = loop.triggers;
    expect(t.type).toBe('cron');
    expect(t.schedule).toBe('0 9 * * *');
    expect(t.maxFires).toBe(5);
    expect(t.fireCount).toBe(0);
    expect(t.lastFireAt).toBeUndefined();
    expect(t.loopId).toBe(loop.id);
    expect(t.workspaceId).toBe('ws-9');
    expect(t.id).toMatch(/^trigger_/);
  });

  it('copies the plan (incl. per-step picks), limits, log policy, and context', () => {
    const host = createFakeHost();
    const loop = instantiate(host, definition(), LINK);

    expect(loop.plan.steps[0].execution).toMatchObject({ model: 'HIGH', tools: ['grep'] });
    expect(loop.limits).toEqual(DEFAULT_LIMITS);
    expect(loop.logPolicy).toEqual(DEFAULT_LOG_POLICY);
    expect(loop.contextOverrides).toEqual({ systemPrompt: 'custom', disabledTools: ['bash'] });
  });

  it('copies the delivery setting, cloned, and leaves it unset when absent', () => {
    const host = createFakeHost();
    const def = { ...definition(), delivery: { destination: 'webhook-post' as const, params: { url: 'https://example.test/hook' } } };
    const loop = instantiate(host, def, LINK);

    expect(loop.delivery).toEqual(def.delivery);
    expect(loop.delivery).not.toBe(def.delivery);
    expect(instantiate(host, definition(), LINK).delivery).toBeUndefined();
  });

  it('clones the plan so the loop and the definition do not share state', () => {
    const host = createFakeHost();
    const def = definition();
    const loop = instantiate(host, def, LINK);

    loop.plan.objective = 'mutated';
    expect(def.plan.objective).toBe('Triage');
  });

  it('round-trips: a saved instance reproduces the definition it came from', () => {
    const host = createFakeHost();
    const def = definition();
    const back = toSharedDefinition(instantiate(host, def, LINK));

    expect(back.plan).toEqual(def.plan);
    expect(back.limits).toEqual(def.limits);
    expect(back.logPolicy).toEqual(def.logPolicy);
    expect(back.contextOverrides).toEqual(def.contextOverrides);
    expect(back.triggers).toEqual([
      { type: 'cron', schedule: '0 9 * * *', eventSource: undefined, eventFilter: undefined, debounceMs: undefined, maxFires: 5 },
    ]);
  });
});
