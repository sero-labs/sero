import { describe, expect, it } from 'vitest';
import { buildLibrarySave, plansStructurallyDiffer, toSharedDefinition, toSharedTrigger } from '../library';
import { DEFAULT_LIMITS, DEFAULT_LOG_POLICY, DEFAULT_WORKSPACE_SETTINGS } from '../defaults';
import { loopParentSessionId } from '../ids';
import type { LibraryEntry, Loop, LoopPlan, LoopTrigger } from '../types';

const PLAN: LoopPlan = {
  schemaVersion: 1,
  revision: 2,
  objective: 'Do the thing',
  steps: [
    { id: 'a', title: 'A', instructions: 'do a', execution: { type: 'background-agent', model: 'HIGH', tools: ['grep'] } },
    { id: 'b', title: 'B', instructions: 'do b', dependsOn: ['a'], execution: { type: 'model', model: 'LOW' } },
  ],
};

const TRIGGER: LoopTrigger = {
  id: 'trigger_1',
  loopId: 'loop_1',
  workspaceId: 'ws-1',
  type: 'cron',
  schedule: '0 9 * * *',
  fireCount: 7,
  lastFireAt: '2026-06-01T09:00:00.000Z',
  nextFireAt: '2026-06-02T09:00:00.000Z',
};

function makeLoop(overrides: Partial<Loop> = {}): Loop {
  const now = '2026-06-27T00:00:00.000Z';
  return {
    id: 'loop_1',
    workspaceId: 'ws-1',
    title: 'My loop',
    prompt: 'the prompt',
    summary: 'the summary',
    status: 'active',
    workspace: { ...DEFAULT_WORKSPACE_SETTINGS },
    plan: structuredClone(PLAN),
    runtime: {
      parentSessionId: loopParentSessionId('ws-1', 'loop_1'),
      variables: { notes: 'scratch' },
      stepStates: {},
      workspace: {},
    },
    triggers: [structuredClone(TRIGGER)],
    limits: { ...DEFAULT_LIMITS },
    logPolicy: { ...DEFAULT_LOG_POLICY },
    contextOverrides: { systemPrompt: 'custom', disabledTools: ['bash'], disabledSkills: [] },
    warnings: [],
    runs: [{ id: 'run_1' } as Loop['runs'][number]],
    revisions: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('toSharedTrigger', () => {
  it('keeps the portable config and drops ids and fire counters', () => {
    expect(toSharedTrigger(TRIGGER)).toEqual({
      type: 'cron',
      schedule: '0 9 * * *',
      eventSource: undefined,
      eventFilter: undefined,
      debounceMs: undefined,
      maxFires: undefined,
    });
  });

  it('round-trips the event half (source, filter, condition, debounce)', () => {
    expect(
      toSharedTrigger({
        ...TRIGGER,
        type: 'event',
        schedule: undefined,
        eventSource: 'github:ci-failed',
        eventFilter: { repo: 'sero' },
        eventCondition: 'the failing PR was opened by this loop',
        debounceMs: 60_000,
      }),
    ).toEqual({
      type: 'event',
      eventSource: 'github:ci-failed',
      eventFilter: { repo: 'sero' },
      eventCondition: 'the failing PR was opened by this loop',
      debounceMs: 60_000,
    });
  });
});

describe('toSharedDefinition', () => {
  it('captures the definition and excludes all instance/runtime state', () => {
    const def = toSharedDefinition(makeLoop());

    expect(def.schemaVersion).toBe(1);
    expect(def.prompt).toBe('the prompt');
    expect(def.title).toBe('My loop');
    expect(def.summary).toBe('the summary');
    expect(def.plan).toEqual(PLAN);
    expect(def.limits).toEqual(DEFAULT_LIMITS);
    expect(def.logPolicy).toEqual(DEFAULT_LOG_POLICY);
    expect(def.contextOverrides).toEqual({ systemPrompt: 'custom', disabledTools: ['bash'], disabledSkills: [] });

    // Triggers reduced to portable config — no ids/counters.
    expect(def.triggers).toEqual([
      { type: 'cron', schedule: '0 9 * * *', eventSource: undefined, eventFilter: undefined, debounceMs: undefined, maxFires: undefined },
    ]);

    // No instance/runtime fields leak through.
    const keys = Object.keys(def);
    for (const banned of ['id', 'workspaceId', 'status', 'runtime', 'runs', 'revisions', 'createdAt', 'updatedAt', 'libraryLink', 'stepOverrides']) {
      expect(keys).not.toContain(banned);
    }
  });

  it("embeds the loop's current per-step model/tool picks in the saved plan", () => {
    const def = toSharedDefinition(makeLoop());
    expect(def.plan.steps[0].execution).toMatchObject({ model: 'HIGH', tools: ['grep'] });
    expect(def.plan.steps[1].execution).toMatchObject({ model: 'LOW' });
  });

  it('clones the plan so later loop mutations do not change the saved definition', () => {
    const loop = makeLoop();
    const def = toSharedDefinition(loop);
    loop.plan.objective = 'mutated';
    expect(def.plan.objective).toBe('Do the thing');
  });
});

describe('buildLibrarySave', () => {
  it('starts a new entry at v1 with the given name and the loop definition', () => {
    const { entry, version, link } = buildLibrarySave({
      loop: makeLoop(),
      existing: null,
      entryId: 'entry_new',
      name: 'Triage PRs',
      now: '2026-06-29T00:00:00.000Z',
      savedFromWorkspaceId: 'ws-1',
    });

    expect(entry).toEqual({
      id: 'entry_new',
      name: 'Triage PRs',
      summary: 'the summary',
      latestVersion: 1,
      createdAt: '2026-06-29T00:00:00.000Z',
      updatedAt: '2026-06-29T00:00:00.000Z',
    });
    expect(version.version).toBe(1);
    expect(version.savedFromWorkspaceId).toBe('ws-1');
    expect(version.definition.plan.objective).toBe('Do the thing');
    expect(link).toEqual({ entryId: 'entry_new', version: 1, syncedAt: '2026-06-29T00:00:00.000Z' });
  });

  it('bumps an existing entry to the next version, preserving its name', () => {
    const existing: LibraryEntry = {
      id: 'entry_1',
      name: 'Renamed by user',
      summary: 'old summary',
      latestVersion: 2,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-10T00:00:00.000Z',
    };
    const { entry, version, link } = buildLibrarySave({
      loop: makeLoop({ summary: 'fresh summary' }),
      existing,
      entryId: existing.id,
      name: 'ignored when bumping',
      now: '2026-06-29T00:00:00.000Z',
      savedFromWorkspaceId: 'ws-2',
    });

    expect(entry.name).toBe('Renamed by user');
    expect(entry.summary).toBe('fresh summary');
    expect(entry.latestVersion).toBe(3);
    expect(entry.createdAt).toBe('2026-06-01T00:00:00.000Z');
    expect(entry.updatedAt).toBe('2026-06-29T00:00:00.000Z');
    expect(version.version).toBe(3);
    expect(link.version).toBe(3);
  });

  it('trims the change note and drops an empty one', () => {
    const save = buildLibrarySave({
      loop: makeLoop(), existing: null, entryId: 'e', name: 'n', note: '  added a step  ', now: 'now', savedFromWorkspaceId: 'ws-1',
    });
    expect(save.version.note).toBe('added a step');

    const blank = buildLibrarySave({
      loop: makeLoop(), existing: null, entryId: 'e', name: 'n', note: '   ', now: 'now', savedFromWorkspaceId: 'ws-1',
    });
    expect(blank.version.note).toBeUndefined();
  });
});

describe('plansStructurallyDiffer', () => {
  it('is false for the same plan', () => {
    expect(plansStructurallyDiffer(PLAN, structuredClone(PLAN))).toBe(false);
  });

  it('ignores local model/tool picks (the overlay)', () => {
    const tweaked = structuredClone(PLAN);
    tweaked.steps[0].execution = { type: 'background-agent', model: 'LOW', tools: ['web_search'] };
    tweaked.steps[1].execution = { type: 'model', model: 'HIGH', thinking: 'high' };
    expect(plansStructurallyDiffer(PLAN, tweaked)).toBe(false);
  });

  it('is true when the structure changes', () => {
    const reworded = structuredClone(PLAN);
    reworded.steps[0].instructions = 'do something else';
    expect(plansStructurallyDiffer(PLAN, reworded)).toBe(true);

    const reObjectived = structuredClone(PLAN);
    reObjectived.objective = 'A different objective';
    expect(plansStructurallyDiffer(PLAN, reObjectived)).toBe(true);

    const added = structuredClone(PLAN);
    added.steps.push({ id: 'c', title: 'C', instructions: 'new', dependsOn: ['b'], execution: { type: 'model' } });
    expect(plansStructurallyDiffer(PLAN, added)).toBe(true);
  });
});
