/**
 * The typed dispatch handle (spec orchestrator-dispatch-handle): a plugin
 * runtime in Electron main creates Workflows and Rooms through @sero-ai/common
 * without session tools, and gets the same planner, limits and grant prompt as
 * the `orchestrator` and `rooms` tools.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOrchestratorRoom,
  getOrchestratorRoomRegistry,
  modelKey,
  requestOrchestratorAction,
  sameOrchestratorProjectAttribution,
  type OrchestratorBoardAction,
} from '@sero-ai/common';
import type { RoomBlueprint } from '../../shared/room-blueprint-types';
import { Coordinator } from '../coordinator';
import {
  registerCoordinator,
  registerRoomCoordinator,
  registeredWorkspaceIds,
  unregisterCoordinator,
  unregisterRoomCoordinator,
} from '../registry';
import { createRoomAppActions } from '../rooms/room-app-actions';
import type { RoomCommandRouter } from '../rooms/room-command-router';
import { createRoomDispatchHandle } from '../rooms/room-dispatch-handle';
import { createFakeHost } from './fake-host';
import { planJson, oneStepPlan, seedActiveLoop } from './fixtures';
import { createRoomHarness, disposeHarness, envelopeWith } from './room-harness';

afterEach(() => {
  for (const id of registeredWorkspaceIds()) unregisterCoordinator(id);
  unregisterRoomCoordinator('ws-1');
});

describe('Workflow creation through the typed handle', () => {
  it('takes the planner and limits path the orchestrator tool uses and returns the loop id', async () => {
    const host = createFakeHost({ workspaceId: 'ws-1' });
    host.modelResponses.push({ response: planJson(oneStepPlan()) });
    registerCoordinator('ws-1', '/repos/ws-1', new Coordinator(host));

    const action: OrchestratorBoardAction = {
      kind: 'create',
      prompt: 'Build the grid and field of view',
      title: 'Milestone 1',
      options: { limits: { maxCostUsd: 12 } },
    };
    const result = await requestOrchestratorAction('ws-1', action);

    expect(result.ok).toBe(true);
    expect(result.loopId).toBeDefined();
    const loop = host.state.loops.find((candidate) => candidate.id === result.loopId);
    expect(loop?.title).toBe('Milestone 1');
    expect(loop?.limits.maxCostUsd).toBe(12);
    // The planner ran for this loop, exactly as it does for the tool.
    expect(host.modelCalls[0].task).toContain('Build the grid and field of view');
  });

  it('fails by workspace name when no coordinator is registered', async () => {
    const result = await requestOrchestratorAction('ws-missing', { kind: 'create', prompt: 'anything' });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('"ws-missing"') });
  });

  it('retains the project display name in the draft loop without changing attribution', async () => {
    const host = createFakeHost({ workspaceId: 'ws-1' });
    host.modelResponses.push({ response: planJson(oneStepPlan()) });
    registerCoordinator('ws-1', '/repos/ws-1', new Coordinator(host));

    const project = { projectId: 'ws-1', runId: 'run-initial', projectName: 'DungeonExplorer' };
    // This path reaches `buildDraftLoop`, which keeps the project context it was given.
    const result = await requestOrchestratorAction('ws-1', {
      kind: 'create', prompt: 'Build the grid and field of view', title: 'Milestone 1', options: { project },
    });

    expect(result.ok).toBe(true);
    const loop = host.state.loops.find((candidate) => candidate.id === result.loopId);
    expect(loop?.project?.projectName).toBe('DungeonExplorer');
    // The name is display only: a rename must not read as a different request.
    expect(sameOrchestratorProjectAttribution(loop?.project, { ...project, projectName: 'Renamed' })).toBe(true);
    expect(sameOrchestratorProjectAttribution(loop?.project, { ...project, runId: 'run-other' })).toBe(false);
  });
});

describe('Room creation through the typed handle', () => {
  let dir: string;
  let host: Awaited<ReturnType<typeof createRoomHarness>>['host'];
  let store: Awaited<ReturnType<typeof createRoomHarness>>['store'];
  let app: ReturnType<typeof createRoomAppActions>;

  beforeEach(async () => {
    const harness = await createRoomHarness();
    dir = harness.dir;
    host = harness.host;
    store = harness.store;
    app = createRoomAppActions({ host, store: harness.store, coordinator: harness.coordinator, workspaceId: 'ws-1' });
  });

  afterEach(() => disposeHarness(dir));

  function blueprint(): RoomBlueprint {
    const model = modelKey('anthropic', 'sonnet');
    host.availableModels = [{
      provider: 'anthropic', displayName: 'Anthropic', logo: '',
      models: [{ provider: 'anthropic', modelId: 'sonnet', name: 'Sonnet', reasoning: true }],
    }];
    host.toolCatalog = [{ name: 'read', description: 'Read files' }];
    return {
      schemaVersion: 1,
      title: 'Items and combat',
      approach: 'Design then implement.',
      objective: 'Ship items, combat and permadeath.',
      successCriteria: ['A run can end in death.'],
      roomInstructions: 'Keep the item set small.',
      members: [{
        key: 'lead', displayName: 'Lead', role: 'Lead',
        responsibility: 'Owns the milestone.', mandate: 'Ship the milestone.',
        reasonForInclusion: 'One lead is enough.', isConductor: true,
        model, thinking: 'medium', promptAdditions: [], tools: ['read'],
        skills: [], permissions: 'read-only', needsWorktree: false,
      }],
      teamRationale: 'One lead.',
      collaborationStrategy: 'Work directly.',
      workspacePolicy: { mode: 'read-only-shared', sharedTreeApproved: false, claimPolicy: 'warn' },
      envelope: envelopeWith({
        allowedModels: [model], allowedTools: ['read'], allowedSkills: [],
        allowedThinkingLevels: ['medium'], allowedDeliveryDestinations: ['saved-artifact'],
      }),
      estimatedDurationMs: 60_000,
      estimatedCostUsd: 0.1,
      deliveryDestination: 'saved-artifact',
      openAssumptions: [],
    };
  }

  it('plans, shows the grant prompt on start, and returns the room id', async () => {
    host.modelResponses.push({ response: JSON.stringify(blueprint()) });
    registerRoomCoordinator('ws-1', {} as never, {} as RoomCommandRouter, app);

    expect(getOrchestratorRoomRegistry()?.get('ws-1')?.handle).toBeDefined();
    const result = await createOrchestratorRoom('ws-1', {
      mandate: 'Ship items, combat and permadeath.',
      limits: { access: 'read-only', maxCostUsd: 5 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(host.persistentSessions.proposals).toHaveLength(1);
    expect(host.persistentSessions.proposals[0].workspaceId).toBe('ws-1');
    // The user's limit reached the planner as it does from the panel.
    expect(host.modelCalls[0].task).toContain('read-only');
  });

  it('reuses a saved Room request across repeated handles without planning or granting again', async () => {
    host.modelResponses.push({ response: JSON.stringify(blueprint()) });
    const request = { requestId: 'discovery-1', mandate: 'Develop the product approach.', limits: { access: 'read-only' as const, maxCostUsd: 5 } };
    const first = await createRoomDispatchHandle(app).create(request);
    expect(first.ok).toBe(true);
    const planningCalls = host.modelCalls.length;
    const grants = host.persistentSessions.proposals.length;
    const second = await createRoomDispatchHandle(app).create(request);
    expect(second).toEqual(first);
    expect(host.modelCalls).toHaveLength(planningCalls);
    expect(host.persistentSessions.proposals).toHaveLength(grants);
  });

  it('retains project attribution from a typed dispatch handle', async () => {
    host.modelResponses.push({ response: JSON.stringify(blueprint()) });
    const project = { projectId: 'hollow-depths', runId: 'run-initial', configRevision: 7 };
    const created = await createRoomDispatchHandle(app).create({ mandate: 'Ship items, combat and permadeath.', project });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error);
    const room = await store.readRoom(created.roomId);
    expect(room?.definition.projectContext).toEqual(project);
  });

  it('refuses to re-attribute a saved Room request to another project', async () => {
    host.modelResponses.push({ response: JSON.stringify(blueprint()) });
    const request = { requestId: 'attributed-1', mandate: 'Ship items, combat and permadeath.', project: { projectId: 'hollow-depths', runId: 'run-initial' } };
    const first = await createRoomDispatchHandle(app).create(request);
    expect(first.ok).toBe(true);
    const refused = await createRoomDispatchHandle(app).create({
      ...request,
      project: { projectId: 'ledger', runId: 'run-1' },
    });
    expect(refused).toMatchObject({ ok: false, error: expect.stringContaining('different project') });
  });

  it('refuses a conflicting concurrent reuse of a requestId, while an identical reuse still coalesces', async () => {
    blueprint(); // seeds the model and tool catalogue the planner reads, even though its call hangs
    host.runStructured = vi.fn(async () => new Promise<never>(() => {}));
    const handle = createRoomDispatchHandle(app);
    const request = { requestId: 'concurrent-1', mandate: 'Ship items, combat and permadeath.' };

    const first = handle.create(request);
    // Same requestId, same mandate: joins the first caller rather than
    // planning a second Room.
    const same = handle.create(request);
    // Same requestId, a different mandate: a second, unrelated caller must
    // not be handed the first caller's Room, so this is refused immediately.
    const conflicting = await handle.create({ ...request, mandate: 'Ship something else entirely.' });

    expect(conflicting).toMatchObject({ ok: false, error: expect.stringContaining('different Room mandate') });
    await vi.waitFor(() => expect(host.runStructured).toHaveBeenCalledOnce());
    // The identical reuse never triggered its own planning attempt.
    expect(host.runStructured).toHaveBeenCalledOnce();
    void first;
    void same;
  });

  it('returns the planner question instead of a Room when the planner needs input', async () => {
    blueprint(); // only for the model and tool catalogue it installs on the host
    host.modelResponses.push({
      response: JSON.stringify({ clarifyingQuestions: [{ id: 'q1', prompt: 'Which engine?' }] }),
    });
    const handle = createRoomDispatchHandle(app);

    const result = await handle.create({ mandate: 'Ship it.' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toContain('Which engine?');
    // Typed as well as in the text, so a caller can put it to its own user.
    expect(result.questions).toEqual(['Which engine?']);
    expect(host.persistentSessions.proposals).toHaveLength(0);
  });

  it('fails by workspace name when no Room coordinator is registered', async () => {
    const result = await createOrchestratorRoom('ws-missing', { mandate: 'anything' });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('"ws-missing"') });
  });
});

describe('Trigger arming through the typed handle', () => {
  function seedMaintenanceLoop(host: ReturnType<typeof createFakeHost>, projectId: string) {
    const loop = seedActiveLoop(host, oneStepPlan().plan, 'loop-maint');
    const armed = {
      ...loop,
      project: { projectId, runId: 'run_1' },
      runtime: { ...loop.runtime, activeRunId: 'run_in_flight' },
      triggers: [
        { id: 'issues', loopId: loop.id, workspaceId: 'ws-1', type: 'event' as const, eventSource: 'github:issue-opened', fireCount: 0 },
        { id: 'weekly', loopId: loop.id, workspaceId: 'ws-1', type: 'cron' as const, schedule: '0 8 * * 1', fireCount: 0 },
      ],
    };
    host.state = { ...host.state, loops: [armed] };
    return armed;
  }

  it('disarms every trigger and leaves the run in flight alone', async () => {
    const host = createFakeHost({ workspaceId: 'ws-1' });
    seedMaintenanceLoop(host, 'proj_1');
    registerCoordinator('ws-1', '/repos/ws-1', new Coordinator(host));

    const result = await requestOrchestratorAction('ws-1', {
      kind: 'set_armed',
      loopId: 'loop-maint',
      armed: false,
      owner: { projectId: 'proj_1' },
    });

    expect(result.ok).toBe(true);
    expect(result.changedTriggerIds).toEqual(['issues', 'weekly']);
    const loop = host.state.loops[0];
    expect(loop.triggers.every((t) => t.disabled)).toBe(true);
    expect(loop.status).toBe('active');
    expect(loop.runtime.activeRunId).toBe('run_in_flight');
  });

  it('re-arms exactly the triggers it disarmed, leaving one the user turned off', async () => {
    const host = createFakeHost({ workspaceId: 'ws-1' });
    const loop = seedMaintenanceLoop(host, 'proj_1');
    host.state = {
      ...host.state,
      loops: [{ ...loop, triggers: loop.triggers.map((t) => ({ ...t, disabled: true })) }],
    };
    registerCoordinator('ws-1', '/repos/ws-1', new Coordinator(host));

    const result = await requestOrchestratorAction('ws-1', {
      kind: 'set_armed',
      loopId: 'loop-maint',
      armed: true,
      triggerIds: ['weekly'],
      owner: { projectId: 'proj_1' },
    });

    expect(result.ok).toBe(true);
    const triggers = host.state.loops[0].triggers;
    expect(triggers.find((t) => t.id === 'weekly')?.disabled).toBe(false);
    expect(triggers.find((t) => t.id === 'issues')?.disabled).toBe(true);
  });

  it('refuses a Workflow another project owns and changes nothing', async () => {
    const host = createFakeHost({ workspaceId: 'ws-1' });
    seedMaintenanceLoop(host, 'proj_1');
    registerCoordinator('ws-1', '/repos/ws-1', new Coordinator(host));

    const result = await requestOrchestratorAction('ws-1', {
      kind: 'set_armed',
      loopId: 'loop-maint',
      armed: false,
      owner: { projectId: 'proj_other' },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('loop-maint');
    expect(host.state.loops[0].triggers.some((t) => t.disabled)).toBe(false);
  });
});
