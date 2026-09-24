/**
 * Run inspector fixtures for the preview harness.
 *
 * The rows are not drawn by hand. A journal shaped like the prototype's
 * "Initial delivery" run is folded by the runtime's own read model, so the
 * harness shows exactly what the runtime would send for the same records.
 */

import type { JournalRecord } from '../../runtime/run-journal';
import { buildActivity } from '../../runtime/trace-activity';
import { summarizeTiming, summarizeTrace, tokenComposition } from '../../runtime/trace-summary';
import type { ProjectRecord } from '../../shared/record';
import type { LifetimeView, TracePage, TraceRecord } from '../lib/trace';
import { FIXTURES } from './fixture';

const RUN = 'run-initial';
const START = Date.parse('2026-09-16T09:12:00.000Z');
const at = (minutes: number): string => new Date(START + minutes * 60_000).toISOString();
const MODEL = 'anthropic/claude-sonnet-4';

export const INSPECTOR_PROJECT: ProjectRecord = {
  ...FIXTURES.build!,
  name: 'Hollow Depths',
  session: { ...FIXTURES.build!.session, model: MODEL, thinking: 'medium' },
  runs: [
    { id: 'run-m5', kind: 'maintenance', objectiveId: 'release to GitHub Pages', startedAt: at(-3000), endedAt: at(-2800), outcome: 'delivered' },
    { id: 'run-ci', kind: 'maintenance', objectiveId: 'stale CI event', startedAt: at(-200), endedAt: at(-196), outcome: 'no-work-needed' },
    { id: RUN, kind: 'initial', objectiveId: null, startedAt: at(0), endedAt: null, outcome: 'in-progress' },
  ],
  milestones: [
    { ...FIXTURES.build!.milestones[0]!, id: 'm1', title: 'Grid, movement and field of view', status: 'done',
      dispatch: { kind: 'workflow', id: 'loop_grid', workspaceId: 'hollow', dispatchedAt: at(48), chargedUsd: 0.6, destination: null } },
    { ...FIXTURES.build!.milestones[1]!, id: 'm2', title: 'Procedural level generator with a seed', status: 'running',
      dispatch: { kind: 'workflow', id: 'loop_levels', workspaceId: 'hollow', dispatchedAt: at(140), chargedUsd: 0.23, destination: null } },
  ],
  research: [
    { id: 'r1', roomId: 'room_r1', question: 'What the first minute should teach', stoppingCondition: 'enough', result: 'r', costUsd: 0.16, completedAt: at(30) },
    { id: 'r2', roomId: 'room_r2', question: 'Permadeath rules for a 20 minute run', stoppingCondition: 'enough', result: 'r', costUsd: 0.19, completedAt: at(34) },
    { id: 'r3', roomId: 'room_r3', question: 'Smallest item set with strong interactions', stoppingCondition: 'enough', result: 'r', costUsd: 0.16, completedAt: at(31) },
  ] as ProjectRecord['research'],
};

type Step = Partial<JournalRecord> & { at: string; kind: JournalRecord['kind'] };

/** Builds a journal from simple steps, numbering the records in order. */
function journal(steps: Step[]): JournalRecord[] {
  return steps
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    .map((step, index) => ({ v: 1, seq: index + 1, ...step }) as JournalRecord);
}
const op = (id: string, kind: string, from: number, to: number | null, outcome = 'ok', extra: Partial<JournalRecord> = {}): Step[] => [
  { kind: 'observation', at: at(from), operationId: `${RUN}:${id}`, operationKind: kind, recordKind: 'operation-start', ...extra },
  ...(to === null ? [] : [{ kind: 'observation' as const, at: at(to), operationId: `${RUN}:${id}`, recordKind: 'operation-end', outcome }]),
];
const charge = (minute: number, source: string, costUsd: number, extra: Partial<JournalRecord> = {}): Step =>
  ({ kind: 'usage', at: at(minute), source, costUsd, coverage: 'aggregate', ...extra });
const ownerCharge = (minute: number, wake: string, costUsd: number, input: number, output: number, cacheRead = 0) =>
  charge(minute, 'owner:sess-1', costUsd, { coverage: 'call', parentOperationId: `${RUN}:owner-wake:${wake}`, model: MODEL, thinking: 'medium', usage: { inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: 0 } });

const RECORDS = journal([
  ...op('owner-wake:directive:w1', 'owner-wake', 0, 3, 'ok', { model: MODEL, thinking: 'medium' }),
  ownerCharge(1, 'directive:w1', 0.04, 1840, 320, 12100),
  ownerCharge(2.5, 'directive:w1', 0.02, 930, 208, 3200),
  ...[1, 2, 3].flatMap((index) => [
    charge(4, `room-planning:research:r${index}`, 0.02, { coverage: 'call' }),
    ...Array.from({ length: 6 }, (_, tick) => charge(6 + tick * 4 + index, `room:room_r${index}`, [0.14, 0.17, 0.14][index - 1]! / 6)),
  ]),
  ...op('owner-wake:decision:w2', 'owner-wake', 36, 44, 'ok', { model: MODEL, thinking: 'medium' }),
  ownerCharge(40, 'decision:w2', 0.09, 9330, 2080, 3200),
  ownerCharge(43, 'decision:w2', 0.08, 9800, 1620, 2100),
  ...op('wait:approval', 'wait', 44, 51, 'ok', { waitCause: 'approval' }),
  ...op('wait:queue', 'wait', 51, 52, 'ok', { waitCause: 'queue' }),
  ...op('workflow:m1:plan', 'workflow', 48, 49),
  ...Array.from({ length: 30 }, (_, tick) => charge(50 + tick * 3, 'dispatch:workflow:loop_grid', 0.018)),
  ...op('repair:m1', 'repair', 120, 126, 'failed'),
  charge(123, 'capture:usage_r', 0.01, { coverage: 'call', parentOperationId: `${RUN}:repair:m1` }),
  ...op('evidence:m1', 'evidence', 138, 139, 'failed'),
  ...op('evidence:m1', 'evidence', 141, 143),
  ...op('evidence:m1:capture', 'evidence', 141.5, 142.5, 'ok', { parentOperationId: `${RUN}:evidence:m1` }),
  charge(142, 'capture:usage_1', 0.02, { coverage: 'call', parentOperationId: `${RUN}:evidence:m1:capture` }),
  ...op('owner-wake:dispatch-complete:w3', 'owner-wake', 144, 147, 'ok', { model: MODEL, thinking: 'medium' }),
  ownerCharge(146, 'dispatch-complete:w3', 0.05, 5200, 900, 8000),
  ...op('workflow:m2:plan', 'workflow', 140, 141),
  ...Array.from({ length: 12 }, (_, tick) => charge(142 + tick * 3.5, 'dispatch:workflow:loop_levels', 0.019)),
  ...op('owner-wake:quiet:w4', 'owner-wake', 185, null, 'ok', { model: MODEL, thinking: 'medium' }),
  ownerCharge(186, 'quiet:w4', 0.03, 2400, 400, 9000),
]);

function pageFrom(project: ProjectRecord, runId: string, records: JournalRecord[], incomplete = false): TracePage {
  const built = buildActivity(project, runId, records, true);
  const summary = summarizeTrace(records, { projectId: project.id, runId });
  const timing = summarizeTiming(records);
  const charges: TraceRecord[] = records.filter((record) => record.kind === 'usage').map((record) => {
    const nodeId = built.placeCharge(record);
    return { ...(record as unknown as TraceRecord), nodeId, label: built.labelOf(nodeId) };
  });
  return {
    recorded: true,
    summary: { ...summary, incomplete: summary.incomplete || incomplete },
    timing,
    tokens: tokenComposition(records),
    records: charges,
    nextAfterSeq: null,
    incomplete,
    activity: built.view,
    linkedSharedUsd: 0,
  };
}

export function inspectorPage(): TracePage {
  return pageFrom(INSPECTOR_PROJECT, RUN, RECORDS);
}

/** 1,240 owner wakes over a day, to show that a long run renders a bounded window. */
export function longRunPage(): TracePage {
  const steps = Array.from({ length: 1240 }, (_, index) => [
    ...op(`owner-wake:quiet:w${index}`, 'owner-wake', index, index + 0.8, index % 97 === 0 ? 'failed' : 'ok', { model: MODEL, thinking: 'medium' }),
    ownerCharge(index + 0.5, `quiet:w${index}`, 0.004, 400, 60, 900),
  ]).flat();
  return pageFrom(INSPECTOR_PROJECT, RUN, journal(steps), true);
}

export function lifetimeView(): LifetimeView {
  const spend = (from: number, total: number, steps: number) => Array.from({ length: steps }, (_, index) => ({ at: at(from + index * 10), usd: (total / steps) * (index + 1) }));
  const initial = inspectorPage();
  return {
    runs: [
      { id: 'run-m5', label: 'Maintenance · release to GitHub Pages', kind: 'maintenance', outcome: 'delivered', open: false, recorded: true, attributableUsd: 7.2, linkedSharedUsd: 0, activeMs: 0, waitMs: 0, incomplete: true, spend: spend(-3000, 7.2, 20) },
      { id: 'run-ci', label: 'Maintenance · stale CI event', kind: 'maintenance', outcome: 'no-work-needed', open: false, recorded: true, attributableUsd: 0.03, linkedSharedUsd: 0.06, activeMs: 204_000, waitMs: 0, incomplete: false, spend: spend(-200, 0.03, 2) },
      { id: RUN, label: 'Initial delivery', kind: 'initial', outcome: 'in-progress', open: true, recorded: true, attributableUsd: initial.summary.attributableUsd, linkedSharedUsd: 0, activeMs: initial.timing.activeMs, waitMs: initial.timing.waitMs, incomplete: false, spend: initial.activity.spend },
    ],
    sharedUsd: 0.06,
    unassignedUsd: 3.16,
  };
}
