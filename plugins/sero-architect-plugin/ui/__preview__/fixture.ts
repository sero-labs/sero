/**
 * Typed fixtures for the preview harness and the UI tests: one project in each
 * lifecycle state, with the prototype's data so screenshots line up.
 */

import { createProjectRecord, type Decision, type Milestone, type ProjectRecord } from '../../shared/record';
import type { ArchitectIndexEntry } from '../../shared/types';

const T = (hhmm: string): string => {
  const today = new Date();
  const [h = '0', m = '0'] = hhmm.split(':');
  today.setHours(Number(h), Number(m), 0, 0);
  return today.toISOString();
};

export const IDEA = 'A turn-based roguelike dungeon crawler. Procedural levels, permadeath, a small set of items with strong interactions. Playable in the browser, no accounts.';

const PLAN: { id: string; title: string; kind: 'workflow' | 'room'; preview?: string }[] = [
  { id: 'm1', title: 'Grid, movement and field of view', kind: 'workflow' },
  { id: 'm2', title: 'Procedural level generator with a seed', kind: 'workflow' },
  { id: 'm3', title: 'Items, combat and permadeath', kind: 'room', preview: '/play' },
  { id: 'm4', title: 'Browser build and a playable demo page', kind: 'workflow', preview: '/play?seed=12' },
  { id: 'm5', title: 'Release to GitHub Pages', kind: 'workflow' },
];

function milestone(index: number, overrides: Partial<Milestone> = {}): Milestone {
  const base = PLAN[index]!;
  return {
    id: base.id,
    title: base.title,
    status: 'planned',
    plan: null,
    preview: base.preview ? { route: base.preview } : null,
    dispatch: null,
    evidence: null,
    verification: null,
    parkedBy: null,
    parkedFrom: null,
    receipt: null,
    ...overrides,
  };
}

const dispatched = (index: number, at: string): Milestone['dispatch'] => ({
  kind: PLAN[index]!.kind,
  id: `${PLAN[index]!.kind}-${PLAN[index]!.id}`,
  workspaceId: 'ws-hollow',
  dispatchedAt: T(at),
  chargedUsd: 3.2,
  destination: null,
});

const accepted = (index: number): Milestone => milestone(index, {
  status: 'done',
  dispatch: dispatched(index, '09:49'),
  verification: 'accepted',
  evidence: {
    commit: '3f1c2ab9',
    checkedAt: T('11:05'),
    commands: [
      { command: 'pnpm test', exitCode: 0, output: '38 passed', durationMs: 21_300 },
      { command: 'pnpm typecheck', exitCode: 0, output: '', durationMs: 9_800 },
    ],
    diffSummary: '14 files · +812 −40',
    preview: null,
    passed: true,
    stale: false,
  },
});

export const DECISION: Decision = {
  id: 'd7',
  question: 'How should the dungeon be drawn?',
  options: [
    { id: 'canvas', label: 'Canvas 2D with a sprite atlas', consequence: 'Simplest path. Works in every browser. Caps effects at plain tiles and light.' },
    { id: 'webgl', label: 'WebGL through a small tile shader', consequence: 'Real lighting and fog. Adds one dependency and one week to milestone 4.' },
    { id: 'text', label: 'Text glyphs, classic roguelike', consequence: 'Fastest to build. Limits the demo page to a niche look.' },
  ],
  recommendation: 'canvas',
  reason: 'The choice changes milestone 4 and the browser build. The charter does not name a renderer.',
  dependsOn: ['m4'],
  raisedAt: T('13:01'),
  proposal: null,
  answer: null,
};

function base(overrides: Partial<ProjectRecord>): ProjectRecord {
  const record = createProjectRecord({ id: 'hollow-depths', name: 'Hollow Depths', idea: IDEA, folder: '/Users/dan/Projects/hollow-depths', now: T('09:12') });
  return {
    ...record,
    workspaceId: 'ws-hollow',
    phase: 'build',
    stateLine: 'Milestone 2 is running. Nothing needs you.',
    budget: { capUsd: 40, spentUsd: 11.4, sources: { owner: 2.1, research: 0.9, dispatched: 8.4 } },
    charter: { milestoneIds: PLAN.map((m) => m.id), escalationPolicy: '', autonomy: 'milestones', capUsd: 40, proposedAt: T('09:41'), approvedAt: T('09:48') },
    brief: 'A browser roguelike with procedural levels, permadeath and a small item set built for interactions. Runs are under 20 minutes and shareable by seed. No accounts, no server.',
    history: [
      { at: T('09:12'), phase: 'intake', overlay: null, cause: 'you gave the idea and the folder. Workspace registered, owner session granted.' },
      { at: T('09:14'), phase: 'discovery', overlay: null, cause: 'the Architect ran 3 research questions in parallel.' },
      { at: T('09:41'), phase: 'charter', overlay: null, cause: 'proposed 5 milestones with a $40 cap. You approved at 09:48.' },
      { at: T('09:49'), phase: 'build', overlay: null, cause: 'milestone 1 dispatched as a Workflow.' },
      { at: T('11:05'), phase: 'build', overlay: null, cause: 'milestone 1 reported complete. Evidence ran at 3f1c2ab.' },
      { at: T('11:09'), phase: 'build', overlay: null, cause: 'milestone 1 closed. Milestone 2 dispatched.' },
    ],
    directives: [
      { id: 'dir1', text: 'Keep the art direction monochrome until the demo works.', sentAt: T('09:52'), reply: { text: 'Noted. Milestone plans will not include colour work.', repliedAt: T('09:53') } },
      { id: 'dir2', text: 'Use a seed in the URL so a run can be shared.', sentAt: T('10:30'), reply: { text: 'Added to milestone 2 as an acceptance criterion.', repliedAt: T('10:31') } },
      { id: 'dir3', text: 'Keep milestone 2 small.', sentAt: T('11:08'), reply: { text: 'Milestone 1 accepted on the evidence: tests green at 3f1c2ab, 14 files changed. Milestone 2 dispatched with the seed-in-URL criterion you asked for.', repliedAt: T('11:09') } },
    ],
    session: { ...record.session, grantId: 'grant-1', sessionId: 's-1', sessionPath: '/Users/dan/.sero-ui/sessions/owner.jsonl', grantedTools: ['read', 'bash', 'write', 'edit', 'sero-cli'], model: 'anthropic/claude-sonnet-5', thinking: 'medium', turns: 9, sessionCostUsd: 2.1 },
    ...overrides,
  };
}

export const FIXTURES: Record<string, ProjectRecord> = {
  intake: base({ phase: 'intake', stateLine: 'Setting up the workspace.', budget: { capUsd: null, spentUsd: 0, sources: { owner: 0, research: 0, dispatched: 0 } }, charter: null, brief: null, milestones: [], history: [], directives: [], workspaceId: null }),
  discovery: base({
    phase: 'discovery',
    stateLine: 'Reading three research results before I write the brief.',
    budget: { capUsd: null, spentUsd: 0.9, sources: { owner: 0, research: 0.9, dispatched: 0 } },
    charter: null,
    brief: null,
    milestones: [],
    research: [
      { id: 'r1', question: 'What do the best browser roguelikes get right in the first minute?', stoppingCondition: 'three named examples', result: '…', costUsd: 0.3, completedAt: T('09:20') },
      { id: 'r2', question: 'Which permadeath rules keep a run under 20 minutes?', stoppingCondition: 'a rule set', result: '…', costUsd: 0.3, completedAt: T('09:22') },
      { id: 'r3', question: 'Smallest item set with strong interactions', stoppingCondition: 'a list of 8', result: '…', costUsd: 0.3, completedAt: T('09:25') },
    ],
    directives: [{ id: 'dir0', text: 'Keep the brief short.', sentAt: T('09:30'), reply: { text: 'I will keep the brief to one page and name the cap in the charter. Expect it in a few minutes.', repliedAt: T('09:31') } }],
  }),
  charter: base({
    phase: 'charter',
    stateLine: 'The charter is ready for your approval.',
    budget: { capUsd: 40, spentUsd: 2.3, sources: { owner: 1.4, research: 0.9, dispatched: 0 } },
    charter: { milestoneIds: PLAN.map((m) => m.id), escalationPolicy: '', autonomy: 'milestones', capUsd: 40, proposedAt: T('09:41'), approvedAt: null },
    milestones: PLAN.map((_, i) => milestone(i)),
    directives: [{ id: 'dir0', text: 'Keep the brief short.', sentAt: T('09:30'), reply: { text: 'Charter proposed: 5 milestones, $40 cap, you approve each milestone plan. Rendering is left open and will be a decision in milestone 3.', repliedAt: T('09:41') } }],
  }),
  build: base({ milestones: [accepted(0), milestone(1, { status: 'running', dispatch: dispatched(1, '11:09') }), milestone(2), milestone(3), milestone(4)] }),
  decision: base({
    overlay: 'decision',
    stateLine: 'One decision is waiting on you. Milestone 3 keeps running.',
    budget: { capUsd: 40, spentUsd: 19.7, sources: { owner: 3.1, research: 0.9, dispatched: 15.7 } },
    decisions: [DECISION],
    milestones: [accepted(0), accepted(1), milestone(2, { status: 'running', dispatch: dispatched(2, '12:10') }), milestone(3, { status: 'parked', parkedBy: 'd7', parkedFrom: 'planned' }), milestone(4)],
    directives: [{ id: 'dir3', text: 'Keep milestone 2 small.', sentAt: T('11:08'), reply: { text: 'Raised a decision on rendering. I recommend Canvas 2D so milestone 4 stays inside the cap.', repliedAt: T('13:02') } }],
  }),
  limited: base({
    overlay: 'limited',
    stateLine: 'Stopped at the $40 cap. Milestone 3 is still running; nothing new starts.',
    budget: { capUsd: 40, spentUsd: 40, sources: { owner: 4.1, research: 0.9, dispatched: 35 } },
    milestones: [accepted(0), accepted(1), milestone(2, { status: 'running', dispatch: dispatched(2, '12:10') }), milestone(3), milestone(4)],
    directives: [{ id: 'dir3', text: 'Keep milestone 2 small.', sentAt: T('11:08'), reply: { text: 'Spend reached the cap during milestone 3. I have stopped. Raise the cap and I will continue from the record.', repliedAt: T('15:40') } }],
  }),
  maintain: base({
    phase: 'maintain',
    stateLine: 'Released. One issue triaged today and a fix is being verified.',
    budget: { capUsd: 60, spentUsd: 47.2, sources: { owner: 6, research: 0.9, dispatched: 40.3 } },
    milestones: [
      { ...milestone(4, { status: 'done', verification: 'delivered', receipt: 'PR #14 merged', dispatch: dispatched(4, '17:20') }), evidence: accepted(4).evidence },
      { id: 'maintenance', title: 'Maintenance Workflow', status: 'running', plan: null, preview: null, dispatch: { kind: 'workflow', id: 'workflow-maintenance', workspaceId: 'ws-hollow', dispatchedAt: T('17:30'), chargedUsd: 1.1, destination: null }, evidence: null, verification: null, parkedBy: null, parkedFrom: null, receipt: null },
      { id: 'f12', title: 'Fix: torch light leaks through walls (#12)', status: 'verifying', plan: null, preview: { route: '/play?seed=12' }, dispatch: { kind: 'workflow', id: 'workflow-f12', workspaceId: 'ws-hollow', dispatchedAt: T('08:02'), chargedUsd: 0.8, destination: 'pr' }, evidence: null, verification: 'reported', parkedBy: null, parkedFrom: null, receipt: null },
    ],
    directives: [{ id: 'dir9', text: 'Triage anything that arrives.', sentAt: T('08:00'), reply: { text: 'Issue #12 is real. Dispatched a fix Workflow; PR opens on the existing path once the evidence passes.', repliedAt: T('08:14') } }],
  }),
};

export const LIST_ROWS: ArchitectIndexEntry[] = [
  { id: 'hollow-depths', name: 'Hollow Depths', workspaceId: 'ws-hollow', phase: 'build', overlay: 'decision', stateLine: 'One decision is waiting on you. Milestone 3 keeps running.', spentUsd: 19.7, capUsd: 40, needsYou: 1, updatedAt: T('13:02') },
  { id: 'ledger', name: 'Ledger', workspaceId: 'ws-ledger', phase: 'build', overlay: null, stateLine: 'Milestone 2 is running. Nothing needs you.', spentUsd: 6.1, capUsd: 25, needsYou: 0, updatedAt: T('12:00') },
  { id: 'field-notes', name: 'Field Notes', workspaceId: 'ws-notes', phase: 'maintain', overlay: null, stateLine: 'Released. Quiet since Tuesday.', spentUsd: 31.8, capUsd: 35, needsYou: 0, updatedAt: T('08:00') },
  { id: 'relay', name: 'Relay', workspaceId: 'ws-relay', phase: 'charter', overlay: 'paused', stateLine: 'Paused by you before the charter.', spentUsd: 1.2, capUsd: null, needsYou: 0, updatedAt: T('07:00') },
];
