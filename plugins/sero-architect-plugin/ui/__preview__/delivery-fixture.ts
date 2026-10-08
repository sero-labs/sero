/**
 * Agreement-flow fixtures for the preview harness: one request under a start
 * cap, drawn in the states the overview and the Work view must tell apart.
 * The synth is an example request, not a product type.
 */

import { ORCHESTRATOR_APP_ID, sessionStartedAt, type FeedbackSnapshotReply, type WorkFeedback } from '@sero-ai/common';

import type { Milestone, ProjectRecord } from '../../shared/record';
import { DECISION, FIXTURES } from './fixture';

const WORKSPACE = 'ws-synth';
const ago = (seconds: number): string => new Date(Date.now() - seconds * 1000).toISOString();

const room = (id: string, title: string, status: Milestone['status'], extra: Partial<Milestone> = {}): Milestone => ({
  ...FIXTURES.build!.milestones[1]!,
  id,
  title,
  status,
  plan: null,
  verification: null,
  evidence: null,
  dispatch: { kind: 'room', id: `room-${id}`, workspaceId: WORKSPACE, dispatchedAt: ago(900), chargedUsd: 0.83, destination: null, observedLiveAt: ago(8) },
  ...extra,
});

const checked = (id: string, title: string): Milestone => ({
  ...FIXTURES.build!.milestones[0]!,
  id,
  title,
  dispatch: { kind: 'room', id: `room-${id}`, workspaceId: WORKSPACE, dispatchedAt: ago(3000), chargedUsd: 0.4, destination: null },
});

function synth(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    ...FIXTURES.build!,
    id: 'pocket-synth',
    name: 'Pocket Synth',
    workspaceId: WORKSPACE,
    folder: '~/Projects/pocket-synth',
    idea: 'A small browser synth you can play with the keyboard. One octave on the A to K keys, a waveform switch, attack and release, volume, and a visualizer. No frameworks. It must work offline.',
    phase: 'build',
    autonomy: 'model-judged',
    charter: null,
    brief: null,
    stateLine: 'The keyboard plays one octave. The Room is checking the sound controls.',
    agreement: {
      revision: 1, capUsd: 5, proposedAt: ago(4000), approvedAt: ago(3990),
      authority: { policyId: 'policy-synth', workspaceId: WORKSPACE, roles: {}, maxLiveSessions: 4, maxTotalSessions: 12 },
    },
    working: {
      revision: 2,
      objective: 'A page that plays one octave from the keyboard, with sound controls and a visualizer.',
      approach: 'One Web Audio voice per key. The envelope is applied on a gain node.',
      assumptions: [],
      criteria: [
        { id: 'c1', text: 'Keys A to K play one octave.', userStated: true },
        { id: 'c2', text: 'The waveform switch changes the sound.', userStated: true },
        { id: 'c3', text: 'Attack and release change the envelope.', userStated: true },
      ],
      reason: null,
      updatedAt: ago(1200),
    },
    overview: {
      outcome: { text: 'A small browser synth you can play with the keyboard.', at: ago(3900) },
      objective: { text: 'Next: check sound and controls', at: ago(600) },
    },
    budget: { capUsd: 5, spentUsd: 1.32, incomplete: false, sources: { owner: 0.2, research: 0.09, dispatched: 1.03 } },
    milestones: [checked('keys', 'Playable keyboard'), room('sound', 'Sound controls', 'running'), room('viz', 'Visualizer', 'planned', { dispatch: null })],
    decisions: [],
    directives: [{ id: 'n1', text: 'Keep the page to one file if you can.', sentAt: ago(2000), reply: { text: 'Noted. The build keeps one HTML file and one script.', repliedAt: ago(1990) } }],
    research: [],
    pendingResearch: [],
    blockedReason: null,
    paused: false,
    overlay: null,
    updatedAt: ago(8),
    ...overrides,
  };
}

const base = synth();

export const DELIVERY_FIXTURES: Record<string, ProjectRecord> = {
  'delivery-working': base,
  'delivery-quiet': synth({
    milestones: [], working: undefined, stateLine: '',
    session: { ...FIXTURES.build!.session, workingSince: ago(72) },
    overview: { outcome: base.overview!.outcome!, objective: { text: 'Next: a first playable keyboard', at: ago(120) } },
    budget: { ...base.budget, spentUsd: 0.08 },
  }),
  'delivery-last-known': synth({ milestones: [base.milestones[0]!, room('sound', 'Sound controls', 'running', { dispatch: { ...base.milestones[1]!.dispatch!, observedLiveAt: undefined } }), base.milestones[2]!] }),
  'delivery-decision': synth({
    overlay: 'decision',
    decisions: [{
      ...DECISION, id: 'd1', question: 'Must the synth also play with on-screen keys?',
      reason: 'You asked for keyboard play. On-screen keys change what the page looks like.',
      options: [
        { id: 'no', label: 'Keyboard only', consequence: 'The page stays as you asked. No more cost.' },
        { id: 'yes', label: 'Add on-screen keys', consequence: 'The synth also works on a phone. About $0.40 more, in the $5.00 cap.' },
      ],
      recommendation: 'no', dependsOn: [], raisedAt: ago(60),
    }],
  }),
  'delivery-pausing': synth({ paused: true, overlay: 'paused' }),
  // The Room used its working time. More time is the user's to give, so the
  // recovery is one saved question, and the same Room continues on a yes.
  'delivery-recovering': synth({
    overlay: 'decision',
    decisions: [{
      ...DECISION, id: 'd2', question: 'The Room for "Sound controls" used its 30 min working-time limit. Allow 60 min in total?',
      reason: 'The Room stopped with its work kept. Its spending limit does not change.',
      options: [
        { id: 'apply', label: 'Allow 60 min in total', consequence: 'The same Room continues with its work. Its spending limit does not change.' },
        { id: 'decline', label: 'Keep it stopped', consequence: 'The Room stays stopped. Architect decides what to do with the work it kept.' },
      ],
      recommendation: 'apply', dependsOn: [], raisedAt: ago(40), proposal: { kind: 'room-time', target: 'sound', maxMinutes: 60 },
    }],
  }),
  'delivery-delivered': synth({
    phase: 'maintain',
    milestones: [checked('keys', 'Playable keyboard'), checked('sound', 'Sound controls'), checked('viz', 'Visualizer')],
    overview: { outcome: base.overview!.outcome!, result: { text: 'The synth is in index.html. Open the preview and press A to K.', at: ago(30) }, acknowledgement: { text: 'Noted. The build keeps one HTML file and one script.', at: ago(1990) } },
    budget: { ...base.budget, spentUsd: 2.41 },
  }),
  'delivery-unapproved': synth({
    phase: 'intake', milestones: [], working: undefined, overview: undefined, stateLine: '',
    agreement: { revision: 1, capUsd: 5, proposedAt: ago(30), approvedAt: null, authority: null, refusedAt: ago(10) },
    budget: { capUsd: 5, spentUsd: 0, incomplete: false, sources: { owner: 0, research: 0, dispatched: 0 } },
  }),
};

const snapshot = (key: string, kind: WorkFeedback['kind'], owner: string, scope: Partial<WorkFeedback['scope']>, wait: WorkFeedback['wait'], extra: Partial<WorkFeedback> = {}): WorkFeedback => ({
  key, kind, owner,
  scope: { appId: ORCHESTRATOR_APP_ID, workspaceId: WORKSPACE, projectId: 'pocket-synth', ...scope },
  epoch: sessionStartedAt(), revision: 1, turnId: 't1', attached: true, wait, openCalls: wait ? 1 : 0,
  lastActivityAt: ago(8), contactObservedAt: ago(1), terminal: null,
  ...extra,
});

const ROOM = 'room-sound';
const members: WorkFeedback[] = [
  snapshot(`member:${ROOM}:impl`, 'room-member', 'Implementer', { workId: ROOM, memberId: 'impl' }, { kind: 'tool', toolName: 'edit src/keys.js', since: ago(4) }),
  snapshot(`member:${ROOM}:test`, 'room-member', 'Tester', { workId: ROOM, memberId: 'test' }, { kind: 'tool', toolName: 'bash npx playwright test keys.spec.js', since: ago(21) }),
];
const ownerQuiet = snapshot('owner:pocket-synth', 'owner-wake', 'Architect', { appId: 'architect', workspaceId: 'global' }, { kind: 'request', since: ago(72) });

/** What the work reports in each state. A state not listed reports nothing. */
export const DELIVERY_FEEDBACK: Record<string, WorkFeedback[]> = {
  'delivery-working': members,
  'delivery-decision': members,
  'delivery-pausing': members,
  'delivery-quiet': [ownerQuiet],
  // Reported by an earlier session: it proves nothing about now.
  'delivery-last-known': members.map((entry) => ({ ...entry, epoch: 'earlier-session', wait: null, openCalls: 0 })),
};

export function deliveryFeedback(state: string): FeedbackSnapshotReply {
  return { epoch: sessionStartedAt(), snapshots: DELIVERY_FEEDBACK[state] ?? [] };
}

// ── The board, at the four moments the prototype draws ──────────────────────
// One bug-fix request that the Architect does itself, so the live row is its own.

/** A finished step's checks saved a capture, so the board has a proof picture to ask for. */
const proved = (id: string, title: string): Milestone => {
  const done = checked(id, title);
  return { ...done, dispatch: null, evidence: done.evidence && { ...done.evidence, preview: { route: '/', smokePassed: true, capturePath: `/evidence/${id}.png` } } };
};

const step = (id: string, title: string, status: Milestone['status'], extra: Partial<Milestone> = {}): Milestone =>
  (status === 'done' ? { ...proved(id, title), ...extra } : room(id, title, status, { dispatch: null, ...extra }));

const NOTES = 'Notes clear in the row, column and box';
const SOLVED = 'A finished puzzle is always recognised';
const CHOICES = [
  { text: 'Check both fixes in the real game', why: 'You reported these as a player, so a passing test is not enough.' },
  { text: 'Fix the notes bug first', why: 'It is small and does not touch the other bug.' },
];

const sudoku = (overrides: Partial<ProjectRecord>): ProjectRecord => synth({
  id: 'sudoku', name: 'TestArchitectFinal', folder: '~/workspaces/testarchitectfinal',
  idea: 'Fix two Sudoku bugs: notes that do not clear down a column or box, and a finished puzzle that is not recognised.',
  stateLine: '', directives: [], working: { ...base.working!, assumptions: CHOICES }, createdAt: ago(540),
  ...overrides,
});

const answered = { ...DECISION, id: 'b1', question: 'For puzzles with more than one answer.', dependsOn: [], raisedAt: ago(120),
  options: [
    { id: 'any', label: 'Accept any valid answer', consequence: 'Small change. Fixes every puzzle already saved.' },
    { id: 'one', label: 'Make every new puzzle have one answer', consequence: 'Bigger change. Old saved games keep the bug.' },
  ],
  recommendation: 'any', answer: { optionId: 'any', note: null, answeredAt: ago(60) } };

Object.assign(DELIVERY_FIXTURES, {
  'board-start': sudoku({
    milestones: [], working: undefined, createdAt: ago(60), budget: { ...base.budget, spentUsd: 0.12 },
    overview: { objective: { text: 'I am reading the game code to find the cause of both bugs. I will show you a plan before I change anything.', at: ago(40) } },
  }),
  'board-ask': sudoku({
    overlay: 'decision', budget: { ...base.budget, spentUsd: 1.18 },
    milestones: [step('notes', NOTES, 'done'), step('solved', SOLVED, 'parked', { parkedBy: 'b1' })],
    overview: { objective: { text: 'The notes bug is fixed and I checked it in the real game. The finished-puzzle bug has two possible fixes, and they change the game in different ways. I need you to pick one.', at: ago(30) } },
    decisions: [{ ...answered, question: 'Should a puzzle with more than one answer count as solved?', reason: 'Some Fiendish puzzles have two valid answers. The game accepts only the one it saved.', dependsOn: ['solved'], answer: null }],
  }),
  'board-working': sudoku({
    session: { ...base.session, workingSince: ago(90) },
    createdAt: ago(600), budget: { ...base.budget, spentUsd: 1.31 }, decisions: [answered],
    milestones: [step('notes', NOTES, 'done'), step('solved', SOLVED, 'running')],
    overview: { objective: { text: 'Thanks. I am changing the finished-puzzle check now, then I will play a Fiendish puzzle to its second answer to prove it.', at: ago(20) } },
  }),
  'board-done': sudoku({
    phase: 'maintain', createdAt: ago(780), budget: { ...base.budget, spentUsd: 1.86 }, decisions: [answered],
    milestones: [step('notes', NOTES, 'done'), step('solved', SOLVED, 'done')],
    overview: { result: { text: 'Both bugs are fixed and I checked each one by playing the game. It is ready for you to try.', at: ago(10) } },
  }),
} satisfies Record<string, ProjectRecord>);

const ownerAt = (tool: string, seconds: number): WorkFeedback =>
  snapshot('owner:sudoku', 'owner-wake', 'Architect', { appId: 'architect', workspaceId: 'global', projectId: 'sudoku' }, { kind: 'tool', toolName: tool, since: ago(seconds) });

Object.assign(DELIVERY_FEEDBACK, { 'board-start': [ownerAt('read', 3)], 'board-working': [ownerAt('bash', 14)] });

// The Architect waits on a check it started: nothing needs the user, and the wait says what it is for.
Object.assign(DELIVERY_FIXTURES, {
  'board-waiting': sudoku({
    milestones: [step('notes', NOTES, 'done'), step('solved', SOLVED, 'running')],
    overview: { objective: { text: 'The fix is in. I am waiting for the test Room to finish before I check the result.', at: ago(20) } },
    waits: [{
      id: 'w1', owner: { milestoneId: 'solved', executionId: null }, source: { kind: 'child', id: 'room-solved' }, condition: 'completed',
      deadline: new Date(Date.now() + 40 * 60_000).toISOString(), controlRevision: 0, registeredAt: ago(300), outcome: null, wake: null,
    }],
  }),
} satisfies Record<string, ProjectRecord>);

// ── What the runtime answers in the harness ─────────────────────────────────
// The board asks the runtime for the live turn and for pictures. The harness has
// no runtime, so these answer in its place with the same shapes.

const ROWS = ['53..7....', '6..195...', '.98....6.', '8...6...3', '4..8.3..1', '7...2...6', '.6..7.28.', '...419..5', '....8..79'];

/** A drawing of the game, standing in for a saved screenshot. */
function gamePicture(): string {
  const cells = ROWS.flatMap((row, r) => [...row].map((digit, c) => {
    const fill = r === 6 && c === 4 ? '#bbf7d0' : '#fafaf7';
    const text = digit === '.' ? '' : `<text x="${c * 40 + 20}" y="${r * 40 + 27}" font-size="20" font-family="sans-serif" font-weight="600" text-anchor="middle" fill="#18181b">${digit}</text>`;
    return `<rect x="${c * 40}" y="${r * 40}" width="40" height="40" fill="${fill}" stroke="#d4d4d8"/>${text}`;
  }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360">${cells.join('')}<path d="M120 0v360M240 0v360M0 120h360M0 240h360" stroke="#52525b" stroke-width="2"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** The answer to a projects-tool call the board makes. Anything else has no details. */
export function previewToolDetails(params: Record<string, unknown>): Record<string, unknown> {
  if (params.action === 'picture') return params.newerThan ? {} : { dataUrl: gamePicture(), at: ago(20) };
  if (params.action === 'watch_owner' && params.projectId === 'sudoku') {
    return { ownerLive: {
      projectId: 'sudoku',
      live: {
        turnId: 't1', truncated: false, request: null, revision: 4, updatedAt: ago(1),
        text: 'I am filling the board with the second answer, to see if the game says Solved.',
        tool: { toolName: 'automation_browser', summary: 'open http://localhost:5273', callId: 'c9', startedAt: ago(14) },
      },
      recent: [{ toolName: 'bash', summary: 'npm test' }, { toolName: 'edit', summary: 'src/solved.ts' }, { toolName: 'read', summary: 'src/solved.ts' }],
    } };
  }
  return {};
}
