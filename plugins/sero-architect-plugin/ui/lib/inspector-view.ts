/**
 * What the inspector's components show, decided in plain functions.
 *
 * The components only lay these out. Keeping the decisions here keeps each
 * component small, and keeps the component files exporting only components,
 * so Fast Refresh can preserve their state.
 */

import type { ProjectRecord, ProjectRun } from '../../shared/record';
import { filtersActive, updatesLabel, type ChargeUpdates, type TraceFilters, type TreeRow } from './activity-tree';
import { clock, count, dur, span, usd } from './inspector-format';
import type { ActivityGroup, ActivityNodeView, ActivityState, TokenSet, TracePage, TraceRecord } from './trace';

/** Every activity group, in the order the filter chips show them. */
export const GROUP_LABEL: Record<ActivityGroup, string> = {
  owner: 'Owner',
  research: 'Research',
  planning: 'Planning',
  rooms: 'Rooms',
  workflows: 'Workflows',
  evaluation: 'Evaluation',
  repair: 'Repair',
  waits: 'Waits',
  unassigned: 'Unassigned',
};

/** The word for a state. The icon beside it is decoration, so colour never carries it alone. */
export const STATE_WORD: Record<ActivityState, string> = {
  done: 'done',
  running: 'running',
  waiting: 'waiting',
  failed: 'failed',
  aborted: 'stopped',
  unknown: 'unknown',
};

export const TOKEN_COLOURS: Record<keyof TokenSet, string> = {
  input: 'var(--ar-info)',
  output: 'var(--ar-brand)',
  cacheRead: 'var(--ar-violet)',
  cacheWrite: 'var(--ar-warn)',
};
export const TOKEN_WORD: Record<keyof TokenSet, string> = { input: 'Input', output: 'Output', cacheRead: 'Cache read', cacheWrite: 'Cache write' };

export function runLabel(run: Pick<ProjectRun, 'kind' | 'objectiveId'>): string {
  if (run.kind === 'initial') return 'Initial delivery';
  return run.objectiveId ? `Maintenance · ${run.objectiveId}` : 'Maintenance';
}

// ── Timeline rows ─────────────────────────────────────────

/** The kind in the grey detail, unless the label already says it or it is a group. */
function kindWord(node: ActivityNodeView): string | null {
  if (node.synthetic) return null;
  const word = node.kind.replace(/-/g, ' ');
  return node.label.toLowerCase().startsWith(word) ? null : word;
}

const modelWords = (model: string | null | undefined, thinking: string | null | undefined): (string | null | undefined)[] =>
  [model?.split('/').pop(), thinking];

export interface RowText { label: string; meta: string; retries: string | null; cost: string; state: ActivityState }

/** A timeline row's words: its name, the grey detail, retries and cost. */
export function rowText(row: TreeRow): RowText {
  const { node, updates, charge } = row;
  if (node) {
    return {
      label: node.label,
      meta: [kindWord(node), ...modelWords(node.model, node.thinking)].filter(Boolean).join(' · '),
      retries: node.retries > 0 ? `${node.retries} ${node.retries === 1 ? 'retry' : 'retries'}` : null,
      cost: node.costUsd === null ? '—' : usd(node.costUsd),
      state: node.state,
    };
  }
  if (updates) return { label: updatesLabel(updates), meta: `${updates.records.length} updates`, retries: null, cost: usd(updates.costUsd), state: 'done' };
  return {
    label: 'Usage',
    meta: modelWords(charge?.model, charge?.thinking).filter(Boolean).join(' · '),
    retries: null,
    cost: charge?.costUsd === undefined ? '—' : usd(charge.costUsd),
    state: 'done',
  };
}

// ── Summary tiles ─────────────────────────────────────────

export interface TileView { label: string; value: string; note?: string; unknown?: boolean }

const plural = (value: number, one: string, many: string): string => `${value} ${value === 1 ? one : many}`;

/** A total folded from part of the history is a lower bound, and says so. */
function costTile(summary: TracePage['summary']): TileView {
  const value = `${summary.incomplete ? '≥ ' : ''}${usd(summary.attributableUsd)}`;
  if (!summary.hasAggregate) return { label: 'Attributable cost', value, note: summary.attributableUsd > 0 ? 'per call' : undefined };
  const allAggregate = summary.aggregateUsd >= summary.attributableUsd - 1e-9;
  return { label: 'Attributable cost', value, note: allAggregate ? 'no per-call detail' : `${usd(summary.aggregateUsd)} without per-call detail` };
}

/**
 * The run's six figures. A figure the sources did not measure reads
 * `unavailable`. Active time is a union of observed intervals, so with none
 * observed it is unknown, not zero.
 */
export function totalTiles(page: TracePage): TileView[] {
  const { summary, timing, activity } = page;
  const elapsed = activity.elapsed;
  const elapsedMs = elapsed ? Date.parse(elapsed.to) - Date.parse(elapsed.from) : null;
  const measuredActive = timing.activeMs > 0 || activity.nodes.some((node) => !node.synthetic && node.startAt !== null && node.endAt !== null);
  const waits = Object.entries(timing.waitByCause).map(([cause, ms]) => `${cause} ${dur(ms)}`).join(' · ');
  return [
    { label: 'Elapsed', value: elapsedMs === null ? 'unavailable' : dur(elapsedMs), unknown: elapsedMs === null, note: elapsed ? span(elapsed.from, elapsed.to) : undefined },
    { label: 'Active', value: measuredActive ? dur(timing.activeMs) : 'unavailable', unknown: !measuredActive },
    { label: 'Waiting', value: dur(timing.waitMs), note: waits || undefined },
    costTile(summary),
    { label: 'Linked shared', value: usd(page.linkedSharedUsd) },
    { label: 'Unknown cost', value: plural(summary.unpricedCharges, 'charge', 'charges') },
  ];
}

/** The counters under the tiles. A zero is left out: one the runtime never counted would read as measured. */
export function counterWords(page: TracePage): string[] {
  const { summary, activity } = page;
  const counts: [number, string, string][] = [
    [activity.counters.ownerTurns, 'owner turn', 'owner turns'],
    [summary.requests, 'model request', 'model requests'],
    [summary.toolCalls, 'tool call', 'tool calls'],
    [activity.counters.retries, 'retry', 'retries'],
    [summary.compactions, 'compaction', 'compactions'],
    [activity.counters.failures, 'failure', 'failures'],
  ];
  return counts.filter(([value]) => value > 0).map(([value, one, many]) => plural(value, one, many));
}

// ── Selected-activity facts ───────────────────────────────

/** One labelled fact. A fact the sources did not record is left out, never shown as zero. */
export type FactView = [label: string, value: string];
export interface RoomMember { name: string; model: string; thinking: string }

const COVERAGE_WORD = { call: 'per call', aggregate: 'aggregate', partial: 'partial' } as const;
const present = (facts: (FactView | false | '' | null | undefined)[]): FactView[] => facts.filter((fact): fact is FactView => Array.isArray(fact));

export function updatesFacts(updates: ChargeUpdates): FactView[][] {
  return [
    [['Time', span(updates.from, updates.to)], ['Cost', usd(updates.costUsd)], ['Updates', count(updates.records.length)], ['Coverage', COVERAGE_WORD.aggregate]],
    [updates.sources.length === 1 ? ['Source', updates.sources[0]!] : ['Sources', String(updates.sources.length)]],
  ];
}

/** A charge's token counts, or null when it reported none. */
export function chargeTokens(charge: TraceRecord): TokenSet | null {
  const usage = charge.usage;
  if (!usage || !Object.values(usage).some((value) => typeof value === 'number')) return null;
  return { input: usage.inputTokens ?? 0, output: usage.outputTokens ?? 0, cacheRead: usage.cacheReadTokens ?? 0, cacheWrite: usage.cacheWriteTokens ?? 0 };
}

/** A charge's facts before and after its tokens. */
export function chargeFacts(charge: TraceRecord): { head: FactView[][]; tail: FactView[] } {
  return {
    head: [
      present([['Time', clock(charge.at)], charge.costUsd !== undefined && ['Cost', usd(charge.costUsd)], charge.coverage && ['Coverage', COVERAGE_WORD[charge.coverage]]]),
      present([charge.model && ['Model', charge.model], charge.model && charge.thinking && ['Thinking', charge.thinking]]),
    ],
    tail: present([charge.source && ['Source', charge.source]]),
  };
}

/** Own and inclusive differ only when children were charged too; otherwise one Cost line says it. */
function costFacts(node: ActivityNodeView): FactView[] {
  const charged = node.charges > 0 || node.costUsd !== null;
  // A step nothing was charged against has no cost, coverage or tokens to report.
  if (!charged) return [['Cost', 'no charges recorded']];
  const split = node.ownCostUsd !== null && node.costUsd !== null && Math.abs(node.ownCostUsd - node.costUsd) >= 0.005;
  return present([
    split && ['Attributable', usd(node.ownCostUsd!)],
    split && ['Inclusive', usd(node.costUsd!)],
    !split && node.costUsd !== null && ['Cost', usd(node.costUsd)],
    node.coverage && ['Coverage', COVERAGE_WORD[node.coverage]],
    node.charges > 0 && ['Charges', count(node.charges)],
  ]);
}

/** A research row lists its Room members; any other row its own model. */
function modelFacts(node: ActivityNodeView, members: readonly RoomMember[] | null): FactView[] {
  if (members?.length) return members.map((member) => [member.name.split(' — ')[0]!, `${member.model.split('/').pop()} · ${member.thinking}`]);
  return present([node.model && ['Model', node.model], node.model && node.thinking && ['Thinking', node.thinking]]);
}

/** An activity's facts before its tokens, and the identifying facts after them. */
export function nodeFacts(node: ActivityNodeView, members: readonly RoomMember[] | null): { head: FactView[][]; tail: FactView[]; tokens: TokenSet | null } {
  const from = Date.parse(node.startAt ?? '');
  const to = Date.parse(node.endAt ?? '');
  const kind = node.kind.replace(/-/g, ' ');
  const charged = node.charges > 0 || node.costUsd !== null;
  return {
    head: [
      present([
        !node.label.toLowerCase().startsWith(kind) && ['Kind', kind],
        node.startAt && ['Time', span(node.startAt, node.endAt)],
        Number.isFinite(from) && Number.isFinite(to) && ['Duration', dur(to - from)],
        ...costFacts(node),
        node.retries > 0 && ['Retries', String(node.retries)],
      ]),
      modelFacts(node, members),
    ],
    tail: present([node.error && ['Error', node.error], node.rawId !== node.label && ['ID', node.rawId]]),
    tokens: charged ? node.tokens : null,
  };
}

// ── Run view lookups ──────────────────────────────────────

/** Why a filtered timeline is empty, or null when it is not. */
export function emptyFilterMessage(filters: TraceFilters, rows: number): string | null {
  if (!filtersActive(filters) || rows > 0) return null;
  const failuresAlone = filters.failuresOnly && filters.group === null && filters.model === null;
  return failuresAlone ? 'No failures in this run.' : 'No activity matches these filters.';
}

/** The timeline's count: every activity, or how many the filters matched. */
export function activityCount(filters: TraceFilters, matched: number, total: number): string {
  return filtersActive(filters) ? `${matched} of ${total} activities` : `${total} activities`;
}

/** The Orchestrator run a milestone row was dispatched to, when it has one to open. */
export function milestoneDispatch(record: ProjectRecord, node: ActivityNodeView | undefined): { kind: 'workflow' | 'room'; id: string; workspaceId: string } | null {
  if (node?.kind !== 'milestone') return null;
  const dispatch = record.milestones.find((entry) => entry.id === node.rawId)?.dispatch;
  if (!dispatch?.id || !dispatch.workspaceId) return null;
  return { kind: dispatch.kind, id: dispatch.id, workspaceId: dispatch.workspaceId };
}

/** A research row's Room members, as the project saved them. */
export function roomMembers(record: ProjectRecord, node: ActivityNodeView | undefined): RoomMember[] | null {
  if (node?.kind !== 'research') return null;
  const saved = record.research.find((entry) => entry.id === node.rawId) ?? record.pendingResearch?.find((entry) => entry.id === node.rawId);
  return saved?.models ?? null;
}
