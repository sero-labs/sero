/**
 * The `rooms` tool: the user's Room control surface. One Room of three
 * members lives through every action. The planner and the members are
 * answered by the stub model (rooms-stub.ts): the worker asks the Conductor
 * two questions, the Conductor holds its turn open until the user has
 * answered, released, watched and read, and then proposes two setup changes
 * and a raise of the cost limit for the user to answer.
 */
import fs from 'node:fs/promises';
import { expectText } from '../expect';
import type { ScenarioStep, StepContext, ToolProbe } from '../types';
import {
  finishAllowPress, gateDir, must, openGate, readMember, readRevisions, readRoom, roomDir, roomIdOf, startAllowPress,
  timelineText, waitForHold, waitForRoom, waitForRoomStatus, type RevisionFile,
} from './rooms-support';
import {
  ADJUSTED_TITLE, ANSWER_ONE, ARTIFACT_BODY, INTERVENE_NOTE, LEAD, memberResponder, plannerResponder, RAISED_COST,
  REVIEWER, ROOM_TITLE, WORKER, WORKER_TOOL,
} from './rooms-stub';

const WORKER_TURNS = 'workerTurns';
const OBSERVER = 'tc-observer';

function text(ctx: StepContext, key: string): string {
  const value = ctx.state[key];
  must(typeof value === 'string', `no step saved ${key}`);
  return value;
}

const removers: Array<() => void> = [];

/** The held setup change for one member, once the Conductor has proposed it. */
function heldRevision(ctx: StepContext, memberId: string): Promise<RevisionFile> {
  const roomId = roomIdOf(ctx);
  return waitForRoom(ctx, `the held setup change for ${memberId}`, async () =>
    (await readRevisions(ctx, roomId)).find((revision) =>
      revision.proposal?.kind === 'change-configuration' && revision.proposal.memberId === memberId && revision.amendment?.state === 'held'));
}

const prepare: ScenarioStep = {
  action: 'prepare',
  setup: async (ctx) => {
    removers.push(ctx.respondWith!(plannerResponder));
    removers.push(ctx.respondWith!(memberResponder(ctx)));
  },
  params: { action: 'prepare', problem: 'tc-room-problem: show a Room that asks, answers and changes.', maxCostUsd: 2, maxMembers: 3, access: 'edit-workspace' },
  expect: async (result, ctx) => {
    expectText(result, 'is ready to review');
    const roomId = /Room (\S+) is ready to review/.exec(result.text)?.[1];
    must(roomId, `no Room id in: ${result.text}`);
    ctx.state.roomId = roomId;
    const room = await readRoom(ctx, roomId);
    must(room?.definition.title === ROOM_TITLE, `room.json holds the title ${room?.definition.title}, expected ${ROOM_TITLE}`);
    must(room.runtime.status === 'draft', `a prepared Room should be a draft, got ${room.runtime.status}`);
    must(room.memberIds.length === 3, `the planner staffed ${room.memberIds.length} members, expected 3`);
  },
};

const adjust: ScenarioStep = {
  action: 'adjust',
  params: (ctx) => ({ action: 'adjust', roomId: roomIdOf(ctx), instruction: `Rename the Room to "${ADJUSTED_TITLE}" and change nothing else.` }),
  expect: async (result, ctx) => {
    expectText(result, 'is ready to review');
    const room = await readRoom(ctx, roomIdOf(ctx));
    must(room?.definition.title === ADJUSTED_TITLE, `room.json still holds the title ${room?.definition.title}`);
    must(room.runtime.status === 'draft', `an adjusted Room should still be a draft, got ${room.runtime.status}`);
    must(room.memberIds.length === 3, 'adjusting changed the team');
  },
};

const start: ScenarioStep = {
  action: 'start',
  setup: async (ctx) => startAllowPress(ctx, 'rooms-start'),
  params: (ctx) => ({ action: 'start', roomId: roomIdOf(ctx) }),
  expect: async (result, ctx) => {
    expectText(result, 'started');
    await finishAllowPress('rooms-start');
    await waitForRoomStatus(ctx, roomIdOf(ctx), 'running');
    const roomId = roomIdOf(ctx);
    // The worker's first turn asks the Conductor a question and waits for it.
    const asking = await waitForRoom(ctx, 'the worker to wait on its first question', async () => {
      const member = await readMember(ctx, roomId, WORKER);
      return member?.status === 'waiting' ? member.waitingOnQuestionId : null;
    });
    ctx.state.questionOne = asking;
  },
  timeoutMs: 240_000,
};

const answer: ScenarioStep = {
  action: 'answer',
  // The Conductor is inside its hold, so nobody is left to answer and the Room does not free the worker by itself.
  setup: async (ctx) => { await waitForHold(ctx); },
  params: (ctx) => ({ action: 'answer', roomId: roomIdOf(ctx), memberId: WORKER, body: ANSWER_ONE }),
  expect: async (result, ctx) => {
    expectText(result, 'has its answer');
    const roomId = roomIdOf(ctx);
    const before = text(ctx, 'questionOne');
    // The answer woke the worker, which asked a second question.
    const next = await waitForRoom(ctx, 'the worker to ask its second question', async () => {
      const member = await readMember(ctx, roomId, WORKER);
      return member?.status === 'waiting' && member.waitingOnQuestionId && member.waitingOnQuestionId !== before ? member.waitingOnQuestionId : null;
    });
    ctx.state.questionTwo = next;
  },
};

const release: ScenarioStep = {
  action: 'release',
  params: (ctx) => ({ action: 'release', roomId: roomIdOf(ctx), memberId: WORKER }),
  expect: async (result, ctx) => {
    expectText(result, 'no longer waiting');
    const roomId = roomIdOf(ctx);
    // Released, the worker carries on and publishes its report.
    const artifact = await waitForRoom(ctx, 'the worker to publish its report', async () => (await readRoom(ctx, roomId))?.artifacts[0]);
    ctx.state.artifactId = artifact.id;
    const member = await readMember(ctx, roomId, WORKER);
    must(member?.waitingOnQuestionId !== text(ctx, 'questionTwo'), 'the worker is still waiting on the released question');
  },
};

const readArtifact: ScenarioStep = {
  action: 'read_artifact',
  params: (ctx) => ({ action: 'read_artifact', roomId: roomIdOf(ctx), artifactId: text(ctx, 'artifactId') }),
  expect: (result) => expectText(result, ARTIFACT_BODY),
};

const intervene: ScenarioStep = {
  action: 'intervene',
  setup: async (ctx) => {
    const roomId = roomIdOf(ctx);
    await waitForRoom(ctx, 'the worker to be idle', async () => (await readMember(ctx, roomId, WORKER))?.status === 'idle');
  },
  params: (ctx) => ({ action: 'intervene', roomId: roomIdOf(ctx), body: INTERVENE_NOTE, memberIds: WORKER, deliver: 'now' }),
  expect: async (result, ctx) => {
    expectText(result, 'awake');
    const roomId = roomIdOf(ctx);
    // The worker read the note and said so in the Room's timeline.
    await waitForRoom(ctx, 'the worker to answer the note', async () => (await timelineText(ctx, roomId)).includes('tc-intervened'));
  },
};

const wake: ScenarioStep = {
  action: 'wake',
  setup: async (ctx) => {
    const roomId = roomIdOf(ctx);
    const idle = await waitForRoom(ctx, 'the worker to be idle again', async () => {
      const member = await readMember(ctx, roomId, WORKER);
      return member?.status === 'idle' ? member : null;
    });
    ctx.state[WORKER_TURNS] = String(idle.usage.turns);
  },
  params: (ctx) => ({ action: 'wake', roomId: roomIdOf(ctx), memberId: WORKER }),
  expect: async (result, ctx) => {
    expectText(result, 'is awake');
    const roomId = roomIdOf(ctx);
    const before = Number(text(ctx, WORKER_TURNS));
    await waitForRoom(ctx, 'the worker to take a turn', async () => ((await readMember(ctx, roomId, WORKER))?.usage.turns ?? 0) > before);
    await waitForRoom(ctx, 'the worker to report it is awake', async () => (await timelineText(ctx, roomId)).includes('tc-worker-woken'));
  },
};

const watch: ScenarioStep = {
  action: 'watch',
  params: (ctx) => ({ action: 'watch', roomId: roomIdOf(ctx), observerId: OBSERVER }),
  expect: (result) => expectText(result, 'of 3 member(s) are mid-turn'),
};

const unwatch: ScenarioStep = {
  action: 'unwatch',
  params: (ctx) => ({ action: 'unwatch', roomId: roomIdOf(ctx), observerId: OBSERVER }),
  expect: (result, ctx) => expectText(result, `Stopped watching Room ${roomIdOf(ctx)}`),
};

const history: ScenarioStep = {
  action: 'history',
  params: (ctx) => ({ action: 'history', roomId: roomIdOf(ctx), memberId: WORKER, limit: 50 }),
  expect: (result) => {
    expectText(result, 'history entry(ies) for tc-worker');
    must(!result.text.startsWith('0 '), `the worker has taken turns, so its history cannot be empty: ${result.text}`);
  },
};

const context: ScenarioStep = {
  action: 'context',
  // The Conductor is mid-turn in its hold, so its session is certainly live.
  params: (ctx) => ({ action: 'context', roomId: roomIdOf(ctx), memberId: LEAD }),
  expect: (result) => expectText(result, 'has used'),
};

const feedback: ScenarioStep = {
  action: 'feedback',
  params: { action: 'feedback' },
  expect: (result) => {
    expectText(result, 'work item(s) reported');
    must(/^\d+ work item\(s\) reported\.$/.test(result.text.trim()), `unexpected feedback line: ${result.text}`);
  },
};

const liveCalls: ScenarioStep = {
  action: 'live_calls',
  params: { action: 'live_calls' },
  expect: (result) => {
    expectText(result, 'call(s) running');
    must(/^\d+ call\(s\) running\.$/.test(result.text.trim()), `unexpected live calls line: ${result.text}`);
  },
};

const timeline: ScenarioStep = {
  action: 'timeline',
  params: (ctx) => ({ action: 'timeline', roomId: roomIdOf(ctx), limit: 3 }),
  expect: async (result, ctx) => {
    expectText(result, '3 event(s)');
    const lines = (await timelineText(ctx, roomIdOf(ctx))).split('\n').filter(Boolean);
    must(lines.length >= 3, `the timeline file has only ${lines.length} events`);
  },
};

const approveRevision: ScenarioStep = {
  action: 'approve_revision',
  setup: async (ctx) => {
    // The Conductor's hold ends, and it proposes the setup changes and the raise.
    await openGate(ctx);
    ctx.state.revisionA = (await heldRevision(ctx, WORKER)).id;
    startAllowPress(ctx, 'rooms-revision');
  },
  params: (ctx) => ({ action: 'approve_revision', roomId: roomIdOf(ctx), revisionId: text(ctx, 'revisionA') }),
  expect: async (result, ctx) => {
    expectText(result, 'approved');
    await finishAllowPress('rooms-revision');
    const roomId = roomIdOf(ctx);
    await waitForRoom(ctx, 'the worker to hold its new tool', async () =>
      (await readMember(ctx, roomId, WORKER))?.configuration.tools.includes(WORKER_TOOL));
    const revision = (await readRevisions(ctx, roomId)).find((entry) => entry.id === text(ctx, 'revisionA'));
    must(revision?.amendment?.state === 'applied', `the approved change is ${revision?.amendment?.state}`);
  },
  timeoutMs: 240_000,
};

const declineRevision: ScenarioStep = {
  action: 'decline_revision',
  setup: async (ctx) => { ctx.state.revisionB = (await heldRevision(ctx, REVIEWER)).id; },
  params: (ctx) => ({ action: 'decline_revision', roomId: roomIdOf(ctx), revisionId: text(ctx, 'revisionB') }),
  expect: async (result, ctx) => {
    expectText(result, 'declined');
    const roomId = roomIdOf(ctx);
    const revision = (await readRevisions(ctx, roomId)).find((entry) => entry.id === text(ctx, 'revisionB'));
    must(revision?.amendment?.state === 'declined', `the declined change is ${revision?.amendment?.state}`);
    const reviewer = await readMember(ctx, roomId, REVIEWER);
    must(!reviewer?.configuration.tools.includes(WORKER_TOOL), 'the declined change still reached the reviewer');
  },
};

const resolveApproval: ScenarioStep = {
  action: 'resolve_approval',
  setup: async (ctx) => {
    const roomId = roomIdOf(ctx);
    const approval = await waitForRoom(ctx, 'the cost raise to wait for the user', async () =>
      (await readRoom(ctx, roomId))?.approvals.find((entry) => entry.kind === 'limit-change' && entry.status === 'pending'));
    ctx.state.approvalId = approval.id;
  },
  params: (ctx) => ({ action: 'resolve_approval', roomId: roomIdOf(ctx), approvalId: text(ctx, 'approvalId'), decision: 'approved' }),
  expect: async (result, ctx) => {
    expectText(result, 'approved');
    const roomId = roomIdOf(ctx);
    const room = await waitForRoom(ctx, 'the cost limit to rise', async () => {
      const current = await readRoom(ctx, roomId);
      return current?.definition.envelope.maxCostUsd === RAISED_COST ? current : null;
    });
    must(room.approvals.find((entry) => entry.id === text(ctx, 'approvalId'))?.status === 'approved', 'the approval was not recorded as approved');
  },
};

const settled = async (ctx: StepContext): Promise<void> => {
  const roomId = roomIdOf(ctx);
  await waitForRoom(ctx, 'every member to stop working', async () => {
    const members = await Promise.all([LEAD, WORKER, REVIEWER].map((id) => readMember(ctx, roomId, id)));
    return members.every((member) => member?.status === 'idle' || member?.status === 'waiting');
  });
};

const pause: ScenarioStep = {
  action: 'pause',
  setup: settled,
  params: (ctx) => ({ action: 'pause', roomId: roomIdOf(ctx), detail: 'tc pause' }),
  expect: async (result, ctx) => {
    expectText(result, 'is pausing');
    await waitForRoomStatus(ctx, roomIdOf(ctx), 'paused');
  },
};

const resume: ScenarioStep = {
  action: 'resume',
  params: (ctx) => ({ action: 'resume', roomId: roomIdOf(ctx) }),
  expect: async (result, ctx) => {
    expectText(result, 'resumed');
    await waitForRoomStatus(ctx, roomIdOf(ctx), 'running');
  },
};

const cancel: ScenarioStep = {
  action: 'cancel',
  params: (ctx) => ({ action: 'cancel', roomId: roomIdOf(ctx), detail: 'tc cancel' }),
  expect: async (result, ctx) => {
    expectText(result, 'cancelled');
    await waitForRoomStatus(ctx, roomIdOf(ctx), 'cancelled');
  },
};

const remove: ScenarioStep = {
  action: 'delete',
  params: (ctx) => ({ action: 'delete', roomId: roomIdOf(ctx) }),
  expect: async (result, ctx) => {
    expectText(result, 'deleted');
    const roomId = roomIdOf(ctx);
    await waitForRoom(ctx, 'the Room folder to go', async () => fs.access(roomDir(ctx, roomId)).then(() => false, () => true));
    await fs.rm(gateDir(ctx), { recursive: true, force: true });
    for (const stop of removers.splice(0)) stop();
  },
};

export const roomsProbe: ToolProbe = {
  tool: 'rooms',
  timeoutMs: 900_000,
  steps: [
    prepare, adjust, start, answer, release, readArtifact, intervene, wake,
    watch, unwatch, history, context, feedback, liveCalls, timeline,
    approveRevision, declineRevision, resolveApproval, pause, resume, cancel, remove,
  ],
  // The site pass only reads, so it makes no Room at every site.
  siteStep: liveCalls,
};
