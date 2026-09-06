/**
 * The typed dispatch handle (spec orchestrator-dispatch-handle): a plugin
 * runtime in Electron main creates Workflows and Rooms through @sero-ai/common
 * without session tools, and gets the same planner, limits and grant prompt as
 * the `orchestrator` and `rooms` tools.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createOrchestratorRoom,
  getOrchestratorRoomRegistry,
  modelKey,
  requestOrchestratorAction,
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
import { planJson, oneStepPlan } from './fixtures';
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
});

describe('Room creation through the typed handle', () => {
  let dir: string;
  let host: Awaited<ReturnType<typeof createRoomHarness>>['host'];
  let app: ReturnType<typeof createRoomAppActions>;

  beforeEach(async () => {
    const harness = await createRoomHarness();
    dir = harness.dir;
    host = harness.host;
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
    expect(host.persistentSessions.proposals).toHaveLength(0);
  });

  it('fails by workspace name when no Room coordinator is registered', async () => {
    const result = await createOrchestratorRoom('ws-missing', { mandate: 'anything' });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('"ws-missing"') });
  });
});
