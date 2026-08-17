/**
 * Shared setup for the Room coordinator suites: a real store in a temp dir and
 * the fake persistent-session capability, so the properties under test are the
 * real ones — one writer, one turn per member, capacity honoured.
 *
 * Split out so the scheduling suite and the restart-recovery suite share one
 * harness and each file stays inside the size limit.
 */

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import type {
  BlueprintMember,
  OperatingEnvelope,
  RoomBlueprint,
} from '../../shared/room-blueprint-types';
import { computeProposalSummary } from '../../shared/room-proposal';
import type { RoomMember } from '../../shared/room-types';
import { createMemberSessionPool } from '../rooms/member-session';
import { RoomCoordinator } from '../rooms/room-coordinator';
import { createRoomStore, type RoomStore } from '../rooms/room-store';
import { createFakeHost, type FakeHost } from './fake-host';

export interface RoomHarness {
  dir: string;
  host: FakeHost;
  store: RoomStore;
  coordinator: RoomCoordinator;
}

function makeCtx(dir: string): AppRuntimeContext {
  const appState = {
    read: async (file: string) => (existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null),
    update: async (file: string, updater: (current: unknown) => unknown) => {
      const current = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null;
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(updater(current)), 'utf8');
    },
  };
  return { stateFilePath: path.join(dir, 'state.json'), host: { appState } } as unknown as AppRuntimeContext;
}

export async function createRoomHarness(): Promise<RoomHarness> {
  const dir = await mkdtemp(path.join(tmpdir(), 'room-coordinator-'));
  const host = createFakeHost();
  const store = createRoomStore(makeCtx(dir));
  return { dir, host, store, coordinator: restartCoordinator(host, store) };
}

/** A second coordinator over the same store and host — what a restart looks like. */
export function restartCoordinator(host: FakeHost, store: RoomStore): RoomCoordinator {
  return new RoomCoordinator(host, { store, sessions: createMemberSessionPool({ host, store }) });
}

export async function disposeHarness(dir: string): Promise<void> {
  // Turns run outside the Room lock, so a test can finish while one last write
  // is in flight. Let the queue drain before the directory goes.
  await new Promise((resolve) => setTimeout(resolve, 25));
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
}

export function envelopeWith(overrides: Partial<OperatingEnvelope> = {}): OperatingEnvelope {
  return {
    maxMembers: 4,
    maxActiveTurns: 2,
    maxRosterRevisions: 5,
    maxMemberReplacements: 2,
    maxWallClockMs: 3_600_000,
    maxCostUsd: 20,
    maxCostUsdPerMember: 10,
    maxTokens: 1_000_000,
    maxTokensPerMember: 500_000,
    maxTurnsPerMember: 20,
    maxRetriesPerMember: 3,
    maxConsecutiveFailures: 2,
    allowedModels: ['sonnet'],
    allowedThinkingLevels: ['medium'],
    allowedTools: ['read', 'write'],
    allowedSkills: [],
    workspacePolicy: { mode: 'read-only-shared', sharedTreeApproved: false, claimPolicy: 'warn' },
    allowedDeliveryDestinations: ['saved-artifact'],
    allowNestedSubagents: false,
    maxIdleMs: 600_000,
    ...overrides,
  };
}

export function member(overrides: Partial<BlueprintMember> = {}): BlueprintMember {
  return {
    key: 'lead',
    displayName: 'Lead',
    role: 'Conductor',
    responsibility: 'Coordinates the Room.',
    mandate: 'Keep the team moving.',
    isConductor: true,
    model: 'sonnet',
    thinking: 'medium',
    promptAdditions: [],
    tools: ['read'],
    skills: [],
    permissions: 'read-only',
    needsWorktree: false,
    reasonForInclusion: 'Someone has to decide.',
    ...overrides,
  };
}

export const MEMBERS: BlueprintMember[] = [
  member(),
  member({ key: 'impl', displayName: 'Implementer', role: 'Implementer', isConductor: false }),
  member({ key: 'scout', displayName: 'Scout', role: 'Researcher', isConductor: false }),
];

export function blueprintWith(envelope: OperatingEnvelope, members: BlueprintMember[]): RoomBlueprint {
  return {
    schemaVersion: 1,
    title: 'Ship the fix',
    approach: 'Split the work.',
    objective: 'Fix the crash on start',
    successCriteria: ['the app starts'],
    roomInstructions: 'Use sero-cli to talk to the Room.',
    members,
    teamRationale: 'One decides, two work.',
    collaborationStrategy: 'direct',
    workspacePolicy: envelope.workspacePolicy,
    envelope,
    estimatedDurationMs: 60_000,
    estimatedCostUsd: 1,
    deliveryDestination: 'saved-artifact',
    openAssumptions: [],
  };
}

export async function draftRoomIn(
  coordinator: RoomCoordinator,
  envelope: OperatingEnvelope,
  members: BlueprintMember[],
): Promise<string> {
  const blueprint = blueprintWith(envelope, members);
  const result = await coordinator.createRoom({
    problemStatement: 'the app crashes',
    blueprint,
    proposal: computeProposalSummary(blueprint),
    workspaceId: 'ws-1',
  });
  if (!result.room) throw new Error(result.error ?? 'no room');
  return result.room.definition.id;
}

export async function memberIn(store: RoomStore, roomId: string, memberId: string): Promise<RoomMember> {
  const found = await store.readMember(roomId, memberId);
  if (!found) throw new Error(`no member ${memberId}`);
  return found;
}

/** Turns are launched outside the Room lock, so tests wait on the store, not on a call. */
export async function waitFor(predicate: () => boolean | Promise<boolean>, label = 'condition'): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}
