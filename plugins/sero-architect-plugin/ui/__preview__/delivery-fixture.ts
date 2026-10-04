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
