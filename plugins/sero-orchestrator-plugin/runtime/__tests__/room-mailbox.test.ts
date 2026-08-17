/**
 * The durable Room mailbox: persistence before delivery, idempotency, the
 * delivery rules and the wait/wake path.
 *
 * Every test runs on a real store in a temp dir and on the real coordinator, so
 * the properties under test are the real ones — a reply resumes a member through
 * the event path, and the periodic tick is never called anywhere in this file.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import type { BlueprintMember, OperatingEnvelope, RoomBlueprint } from '../../shared/room-blueprint-types';
import { computeProposalSummary } from '../../shared/room-proposal';
import { createMemberSessionPool } from '../rooms/member-session';
import { RoomCoordinator } from '../rooms/room-coordinator';
import type { MailboxLimits } from '../rooms/room-mailbox-limits';
import { createRoomStore, type RoomStore } from '../rooms/room-store';
import { createFakeHost, type FakeHost } from './fake-host';

let dir: string;
let host: FakeHost;
let store: RoomStore;
let coordinator: RoomCoordinator;
/** Fault injection for the crash-safety test below. No fault by default. */
let failWrite: (file: string) => boolean;

function makeCtx(): AppRuntimeContext {
  const appState = {
    read: async (file: string) => (existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null),
    update: async (file: string, updater: (current: unknown) => unknown) => {
      if (failWrite(file)) throw new Error(`the disk went away: ${file}`);
      const current = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null;
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(updater(current)), 'utf8');
    },
  };
  return { stateFilePath: path.join(dir, 'state.json'), host: { appState } } as unknown as AppRuntimeContext;
}

const ENVELOPE: OperatingEnvelope = {
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
  allowedTools: ['read'],
  allowedSkills: [],
  workspacePolicy: { mode: 'read-only-shared', sharedTreeApproved: false, claimPolicy: 'warn' },
  allowedDeliveryDestinations: ['saved-artifact'],
  allowNestedSubagents: false,
  maxIdleMs: 600_000,
};

function member(overrides: Partial<BlueprintMember> = {}): BlueprintMember {
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

const MEMBERS: BlueprintMember[] = [
  member(),
  member({ key: 'impl', displayName: 'Implementer', role: 'Implementer', isConductor: false }),
  member({ key: 'scout', displayName: 'Scout', role: 'Researcher', isConductor: false }),
];

async function startRoom(limits?: Partial<MailboxLimits>): Promise<string> {
  const blueprint: RoomBlueprint = {
    schemaVersion: 1,
    title: 'Ship the fix',
    approach: 'Split the work.',
    objective: 'Fix the crash on start',
    successCriteria: ['the app starts'],
    roomInstructions: 'Use sero-cli to talk to the Room.',
    members: MEMBERS,
    teamRationale: 'One decides, two work.',
    collaborationStrategy: 'direct',
    workspacePolicy: ENVELOPE.workspacePolicy,
    envelope: ENVELOPE,
    estimatedDurationMs: 60_000,
    estimatedCostUsd: 1,
    deliveryDestination: 'saved-artifact',
    openAssumptions: [],
  };
  coordinator = new RoomCoordinator(host, {
    store,
    sessions: createMemberSessionPool({ host, store }),
    mailboxLimits: limits,
  });
  const created = await coordinator.createRoom({
    problemStatement: 'the app crashes',
    blueprint,
    proposal: computeProposalSummary(blueprint),
    workspaceId: 'ws-1',
  });
  if (!created.room) throw new Error(created.error ?? 'no room');
  const roomId = created.room.definition.id;
  await coordinator.startRoom(roomId);
  return roomId;
}

async function waitFor(predicate: () => boolean | Promise<boolean>, label = 'condition'): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}

const memberOf = async (roomId: string, memberId: string) => {
  const found = await store.readMember(roomId, memberId);
  if (!found) throw new Error(`no member ${memberId}`);
  return found;
};

const cursorOf = async (roomId: string, memberId: string) => {
  const record = await store.readRoom(roomId);
  const cursor = record?.readCursors.find((entry) => entry.memberId === memberId);
  if (!cursor) throw new Error(`no cursor for ${memberId}`);
  return cursor;
};

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'room-mailbox-'));
  host = createFakeHost();
  failWrite = () => false;
  store = createRoomStore(makeCtx());
});

afterEach(async () => {
  // Turns run outside the Room lock, so a test can finish while one last write
  // is in flight. Let the queue drain before the directory goes.
  await new Promise((resolve) => setTimeout(resolve, 25));
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

describe('durable delivery', () => {
  it('persists a message before delivery and moves the cursor only when a turn takes it', async () => {
    const roomId = await startRoom();
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');

    const sent = await coordinator.mailbox.send(roomId, {
      commandId: 'cmd-1',
      fromMemberId: 'lead',
      toMemberIds: ['impl'],
      body: 'take the parser',
    });
    expect(sent.ok).toBe(true);

    const stored = await store.readMessages(roomId, 0, 10);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ kind: 'direct', toMemberIds: ['impl'], commandId: 'cmd-1' });

    // Persisted and counted, but unread: no wake was requested, so the message
    // waits in the inbox rather than costing a turn.
    expect(await cursorOf(roomId, 'impl')).toMatchObject({ lastReadSequence: 0, pendingCount: 1 });
    expect(host.persistentSessions.sessions.has('impl')).toBe(false);

    await coordinator.wake(roomId, 'impl', 'assigned-work');
    await waitFor(async () => (await memberOf(roomId, 'impl')).usage.turns === 1, 'the delivery turn');
    expect(await cursorOf(roomId, 'impl')).toMatchObject({ lastReadSequence: 1, pendingCount: 0 });
    // Not the last prompt: the Room falls quiet when this turn ends, and the
    // lead is given its own turn to decide what that means.
    expect(host.persistentSessions.prompts.map((entry) => String(entry.content)))
      .toContainEqual(expect.stringContaining('take the parser'));
  });

  it('accepts the name the roster shows, not only the member id', async () => {
    const roomId = await startRoom();

    // A member reads "Implementer" in the roster and writes "Implementer". The
    // ids are what the Room stores, so the message must still land on `impl`.
    const sent = await coordinator.mailbox.send(roomId, {
      commandId: 'cmd-1',
      fromMemberId: 'lead',
      toMemberIds: ['Implementer'],
      body: 'take the parser',
    });

    expect(sent.ok).toBe(true);
    expect((await store.readMessages(roomId, 0, 10))[0]).toMatchObject({ toMemberIds: ['impl'] });
  });

  it('says who is in the Room when it refuses a name nobody answers to', async () => {
    const roomId = await startRoom();

    const sent = await coordinator.mailbox.send(roomId, {
      commandId: 'cmd-1',
      fromMemberId: 'lead',
      toMemberIds: ['Nobody'],
      body: 'take the parser',
    });

    // A refusal that does not say what to write instead costs another turn.
    expect(sent).toMatchObject({ ok: false, code: 'unknown-recipient' });
    const refusal = sent.ok ? '' : sent.message;
    expect(refusal).toContain('impl');
    expect(refusal).toContain('scout');
  });

  it('points a member addressing the user at request-attention', async () => {
    // The user is not on the roster, so `ask --to user` can only be refused. A
    // Conductor that reads "there is no member user" and stops there blocks the
    // whole Room on a question nobody can deliver.
    const roomId = await startRoom();

    const asked = await coordinator.mailbox.ask(roomId, {
      commandId: 'cmd-user',
      fromMemberId: 'lead',
      toMemberIds: ['user'],
      body: 'which rounding rule should we use?',
      waitForReply: true,
    });

    expect(asked).toMatchObject({ ok: false, code: 'unknown-recipient' });
    const refusal = asked.ok ? '' : asked.message;
    expect(refusal).toContain('request-attention');
  });

  it('treats a repeated command id as the same logical message', async () => {
    const roomId = await startRoom();
    const request = {
      commandId: 'cmd-1',
      fromMemberId: 'lead',
      toMemberIds: ['impl'],
      body: 'take the parser',
    };
    await coordinator.mailbox.send(roomId, request);
    const again = await coordinator.mailbox.send(roomId, request);

    expect(again).toMatchObject({ ok: true, duplicate: true, messages: [] });
    expect(await store.readMessages(roomId, 0, 10)).toHaveLength(1);
    expect((await store.readRoom(roomId))?.runtime.messageSequence).toBe(1);
    expect(await cursorOf(roomId, 'impl')).toMatchObject({ pendingCount: 1 });
  });

  it('refuses an oversized body and a member that talks too much', async () => {
    const roomId = await startRoom({ maxBodyChars: 20, maxSendsPerWindow: 2 });
    host.frozenNow = new Date(1_000_000).toISOString();
    const send = (commandId: string, body: string) =>
      coordinator.mailbox.send(roomId, { commandId, fromMemberId: 'lead', toMemberIds: ['impl'], body });

    expect(await send('cmd-1', 'x'.repeat(21))).toMatchObject({ ok: false, code: 'body-too-long' });
    expect((await send('cmd-2', 'one')).ok).toBe(true);
    expect((await send('cmd-3', 'two')).ok).toBe(true);
    expect(await send('cmd-4', 'three')).toMatchObject({ ok: false, code: 'rate-limited' });
  });

  it('never records a command key without the messages it guards', async () => {
    const roomId = await startRoom();
    const request = { commandId: 'cmd-1', fromMemberId: 'lead', toMemberIds: ['impl'], body: 'take the parser' };
    // The message page cannot be written, and nothing after it lands either —
    // what a crash leaves behind, with no chance to undo a key already claimed.
    let broken = false;
    failWrite = (file) => {
      if (broken) return true;
      broken = file.includes(`${path.sep}messages${path.sep}`);
      return broken;
    };
    await expect(coordinator.mailbox.send(roomId, request)).rejects.toThrow();

    failWrite = () => false;
    // A restarted runtime reads the Room back from disk. A key it finds there
    // means the messages are in the log; finding one without them would answer
    // the member's real retry with "already sent".
    const restarted = createRoomStore(makeCtx());
    expect(await restarted.hasAppliedCommand(roomId, 'cmd-1')).toBe(false);

    const retried = await coordinator.mailbox.send(roomId, request);
    expect(retried).toMatchObject({ ok: true, duplicate: false });
    expect(await store.readMessages(roomId, 0, 10)).toHaveLength(1);
  });

  it('turns senders away from an inbox that is already full', async () => {
    const roomId = await startRoom({ maxInboxBacklog: 1 });
    const send = (commandId: string) =>
      coordinator.mailbox.send(roomId, { commandId, fromMemberId: 'lead', toMemberIds: ['impl'], body: 'ping' });

    expect((await send('cmd-1')).ok).toBe(true);
    expect(await send('cmd-2')).toMatchObject({ ok: false, code: 'inbox-full' });
  });
});

describe('broadcasts', () => {
  it('queues for everyone and wakes nobody', async () => {
    const roomId = await startRoom();
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');

    const result = await coordinator.mailbox.broadcast(roomId, {
      commandId: 'cmd-1',
      fromMemberId: 'lead',
      body: 'the build is green',
    });
    expect(result).toMatchObject({ ok: true, wokeMemberIds: [] });

    const [message] = await store.readMessages(roomId, 0, 10);
    // Recipients are frozen at send time, so a member that joins later inherits
    // no backlog and every recipient can be checked against its own limits.
    expect(message.toMemberIds.sort()).toEqual(['impl', 'scout']);
    expect(message.wakeRecipients).toBe(false);
    expect(host.persistentSessions.sessions.has('impl')).toBe(false);
    expect(host.persistentSessions.sessions.has('scout')).toBe(false);
  });

  it('lets a member ask for a wake, refuses it, and says so', async () => {
    const roomId = await startRoom();
    const result = await coordinator.mailbox.broadcast(roomId, {
      commandId: 'cmd-1',
      fromMemberId: 'impl',
      body: 'anyone know the schema?',
      wakeRecipients: true,
    });
    expect(result).toMatchObject({ ok: true, wokeMemberIds: [] });
    expect(result.ok && result.note).toContain('waiting in their inboxes');
    expect(host.persistentSessions.sessions.has('scout')).toBe(false);
  });

  it('wakes on a Conductor broadcast that asks for it', async () => {
    const roomId = await startRoom();
    await waitFor(async () => (await memberOf(roomId, 'lead')).usage.turns === 1, 'the first turn');

    const result = await coordinator.mailbox.broadcast(roomId, {
      commandId: 'cmd-1',
      fromMemberId: 'lead',
      body: 'stop and re-plan',
      wakeRecipients: true,
    });
    expect(result.ok && result.wokeMemberIds.sort()).toEqual(['impl', 'scout']);
    await waitFor(async () => (await memberOf(roomId, 'impl')).usage.turns === 1, 'the woken turn');
  });
});

describe('waiting and waking', () => {
  it('accepts a direct answer when the answerer omits the reply command', async () => {
    const roomId = await startRoom();
    const asked = await coordinator.mailbox.ask(roomId, {
      commandId: 'cmd-1', fromMemberId: 'impl', toMemberIds: ['lead'], body: 'Which test command?',
    });
    expect(asked.ok).toBe(true);
    expect((await memberOf(roomId, 'impl')).status).toBe('waiting');

    const sent = await coordinator.mailbox.send(roomId, {
      commandId: 'cmd-2', fromMemberId: 'lead', toMemberIds: ['impl'], body: 'Use pnpm test.',
    });
    expect(sent.ok && sent.wokeMemberIds).toContain('impl');
    await waitFor(async () => (await memberOf(roomId, 'impl')).status !== 'waiting', 'the direct answer wake');
    expect((await memberOf(roomId, 'impl')).waitingOnQuestionId).toBeNull();
  });

  it('releases the asker slot and resumes the same session on the reply', async () => {
    const roomId = await startRoom();
    const api = host.persistentSessions;
    api.mode = 'manual';
    await waitFor(() => api.openTurns().includes('lead'), 'the Conductor turn');

    const asked = await coordinator.mailbox.ask(roomId, {
      commandId: 'cmd-1',
      fromMemberId: 'lead',
      toMemberIds: ['impl'],
      body: 'which parser is it?',
    });
    expect(asked.ok).toBe(true);
    const question = asked.ok ? asked.messages[0] : null;
    expect(question?.questionId).toBeTruthy();

    // The turn is over as far as the Room is concerned: waiting holds no slot.
    const waiting = await memberOf(roomId, 'lead');
    expect(waiting.status).toBe('waiting');
    expect(waiting.waitingOnQuestionId).toBe(question?.questionId);
    expect((await store.readRoom(roomId))?.runtime.activeMemberIds).not.toContain('lead');

    api.endTurn('lead');
    await waitFor(() => api.openTurns().includes('impl'), 'the answering turn');
    api.endTurn('impl');
    await waitFor(async () => (await memberOf(roomId, 'impl')).usage.turns === 1, 'the answer to finish');

    const sessionBefore = api.sessions.get('lead')?.sessionId;
    const replied = await coordinator.mailbox.reply(roomId, {
      commandId: 'cmd-2',
      fromMemberId: 'impl',
      questionId: question?.questionId ?? '',
      body: 'the JSON one',
    });
    expect(replied.ok && replied.wokeMemberIds).toEqual(['lead']);

    // The event path, not the tick: `tick` is never called in this file.
    await waitFor(() => api.openTurns().includes('lead'), 'the resumed turn');
    const resumed = await memberOf(roomId, 'lead');
    expect(resumed.status).toBe('working');
    expect(resumed.waitingOnQuestionId).toBeNull();
    expect(api.sessions.get('lead')?.sessionId).toBe(sessionBefore);
    expect(String(api.prompts.at(-1)?.content)).toContain('the JSON one');
    api.endTurn('lead');
  });

  it('releases the waiter when the question is withdrawn', async () => {
    const roomId = await startRoom();
    const api = host.persistentSessions;
    api.mode = 'manual';
    await waitFor(() => api.openTurns().includes('lead'), 'the Conductor turn');

    const asked = await coordinator.mailbox.ask(roomId, {
      commandId: 'cmd-1',
      fromMemberId: 'lead',
      toMemberIds: ['impl'],
      body: 'which parser is it?',
    });
    const questionId = asked.ok ? (asked.messages[0].questionId ?? '') : '';
    api.endTurn('lead');
    await waitFor(async () => (await memberOf(roomId, 'lead')).status === 'waiting', 'the wait');

    const refused = await coordinator.mailbox.cancel(roomId, {
      commandId: 'cmd-2',
      fromMemberId: 'scout',
      questionId,
      body: 'not mine to withdraw',
    });
    expect(refused).toMatchObject({ ok: false, code: 'not-your-question' });

    const cancelled = await coordinator.mailbox.cancel(roomId, {
      commandId: 'cmd-3',
      fromMemberId: 'lead',
      questionId,
      body: 'never mind, I found it',
    });
    expect(cancelled.ok && cancelled.wokeMemberIds).toEqual(['lead']);
    await waitFor(() => api.openTurns().includes('lead'), 'the released member');
    expect((await memberOf(roomId, 'lead')).waitingOnQuestionId).toBeNull();
    api.endTurn('lead');
  });

  it('tells the Conductor about a wait cycle, then pauses the Room when it persists', async () => {
    const roomId = await startRoom();
    const api = host.persistentSessions;
    api.mode = 'manual';
    await waitFor(() => api.openTurns().includes('lead'), 'the Conductor turn');
    api.endTurn('lead');
    await waitFor(async () => (await memberOf(roomId, 'lead')).status === 'idle', 'the Conductor to finish');

    const askedByLead = await coordinator.mailbox.ask(roomId, {
      commandId: 'cmd-1',
      fromMemberId: 'lead',
      toMemberIds: ['impl'],
      body: 'what did you change?',
    });
    // The answerer was woken, so end its turn before it answers back.
    await waitFor(() => api.openTurns().includes('impl'), 'the answering turn');
    api.endTurn('impl');
    await waitFor(async () => (await memberOf(roomId, 'impl')).status === 'idle', 'the answerer to finish');

    await coordinator.mailbox.ask(roomId, {
      commandId: 'cmd-2',
      fromMemberId: 'impl',
      toMemberIds: ['lead'],
      body: 'what should I change?',
    });

    // Told, not stopped: the Conductor gets the chance to break the cycle first.
    const notified = await store.readRoom(roomId);
    expect(notified?.runtime.stopReason?.kind).toBe('deadlock');
    expect(notified?.runtime.status).toBe('running');
    const notice = (await store.readMessages(roomId, 0, 20)).find((message) => message.kind === 'system');
    expect(notice?.toMemberIds).toEqual(['lead']);

    // The Conductor was woken by the notice; let its turn end without progress.
    await waitFor(() => api.openTurns().includes('lead'), 'the Conductor wake');
    api.endTurn('lead');
    await waitFor(async () => (await memberOf(roomId, 'lead')).status === 'idle', 'the Conductor to finish');

    await coordinator.mailbox.ask(roomId, {
      commandId: 'cmd-3',
      fromMemberId: 'lead',
      toMemberIds: ['impl'],
      body: 'still waiting on you',
    });
    await waitFor(async () => (await store.readRoom(roomId))?.runtime.status === 'paused', 'the Room to pause');
    expect((await store.readRoom(roomId))?.runtime.stopReason?.kind).toBe('deadlock');
    expect(askedByLead.ok).toBe(true);
  });
});
