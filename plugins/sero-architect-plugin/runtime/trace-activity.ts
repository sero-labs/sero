/**
 * The inspector's activity tree (spec architect-run-observability).
 *
 * The journal says what happened; the project record says what things are
 * called. This joins the two when the inspector reads, so a row reads as a
 * research question or a milestone title instead of an identifier, and a
 * journal written before names mattered is named too. Nothing here is written
 * back: names stay out of the metric records.
 *
 * Every charge is placed under exactly one node. A charge that names its parent
 * goes there; one that does not is placed by its source, which names the
 * research, the Room or the Workflow it paid for. Owner charges without a wake
 * fall under one Owner node, and anything else under Unassigned, so nothing
 * charged is ever dropped from a tree whose costs must add up.
 */

import type { ProjectRecord } from '../shared/record';
import type { JournalRecord } from './run-journal';

export type ActivityGroup = 'owner' | 'research' | 'planning' | 'rooms' | 'workflows' | 'evaluation' | 'repair' | 'waits' | 'unassigned';

export type ActivityState = 'done' | 'running' | 'waiting' | 'failed' | 'aborted' | 'unknown';

export interface TokenSet {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ActivityNode {
  id: string;
  parentId: string | null;
  /** What a person calls it. The raw id only when nothing better was saved. */
  label: string;
  /** The operation kind, or `owner`, `milestone` or `unassigned` for a group. */
  kind: string;
  group: ActivityGroup;
  /** True for a node the journal never opened: a group made to hold charges. */
  synthetic: boolean;
  /** The journal identity behind the label. */
  rawId: string;
  startAt: string | null;
  endAt: string | null;
  state: ActivityState;
  /** Times the operation started again under the same id. */
  retries: number;
  /** Everything charged here and below. Null when nothing priced was charged. */
  costUsd: number | null;
  /** Charged to this node itself, not its children. */
  ownCostUsd: number | null;
  charges: number;
  model?: string;
  thinking?: string;
  /** Null when no charge here or below reported tokens. Never zero for unknown. */
  tokens: TokenSet | null;
  coverage: 'call' | 'aggregate' | 'partial' | null;
  waitCause?: string;
  error?: string;
}

export interface ActivityCounters {
  ownerTurns: number;
  failures: number;
  retries: number;
  waits: number;
}

export interface ActivityView {
  nodes: ActivityNode[];
  /** Cumulative spend, at most `SPEND_POINTS` points, oldest first. */
  spend: { at: string; usd: number }[];
  byGroup: { group: ActivityGroup; usd: number; tokens: TokenSet | null }[];
  /** `model` null means the charges named none. */
  byModel: { model: string | null; usd: number }[];
  counters: ActivityCounters;
  /** First and last observed time. Null when no record carried one. */
  elapsed: { from: string; to: string } | null;
}

const SPEND_POINTS = 200;

const GROUP_OF: Record<string, ActivityGroup> = {
  owner: 'owner', 'owner-wake': 'owner',
  research: 'research',
  planning: 'planning', 'trigger-extraction': 'planning',
  room: 'rooms', 'room-member': 'rooms',
  workflow: 'workflows', 'workflow-step': 'workflows', 'workflow-attempt': 'workflows', 'subagent-run': 'workflows',
  evaluation: 'evaluation', evidence: 'evaluation',
  repair: 'repair',
  wait: 'waits',
  unassigned: 'unassigned',
};

const KIND_LABEL: Record<string, string> = {
  'owner-wake': 'Owner wake',
  planning: 'Room planning',
  'trigger-extraction': 'Trigger extraction',
  room: 'Room',
  'room-member': 'Room member',
  workflow: 'Workflow',
  'workflow-step': 'Workflow step',
  'workflow-attempt': 'Step attempt',
  'subagent-run': 'Subagent',
  evaluation: 'Evaluation',
  evidence: 'Evidence',
  repair: 'Repair',
  delivery: 'Delivery',
  research: 'Research',
};

const WAKE_LABEL: Record<string, string> = {
  directive: 'your directive',
  decision: 'your decision',
  'dispatch-blocked': 'work blocked',
  'dispatch-complete': 'work finished',
  'external-event': 'external event',
  quiet: 'check-in',
};

const WAIT_LABEL: Record<string, string> = {
  approval: 'Waiting for approval',
  queue: 'Waiting in the dispatch queue',
  pause: 'Paused',
  backoff: 'Waiting to retry',
};

/** What the record knows about names and ownership, gathered once per read. */
interface Names {
  research: Map<string, string>;
  roomToResearch: Map<string, string>;
  milestone: Map<string, { title: string; kind: 'workflow' | 'room'; status: string }>;
  /** Research with saved findings. Pending research is still in progress. */
  researchDone: Set<string>;
  dispatchToMilestone: Map<string, string>;
  roomTitle: Map<string, string>;
}

function namesOf(record: ProjectRecord): Names {
  const names: Names = { research: new Map(), roomToResearch: new Map(), milestone: new Map(), dispatchToMilestone: new Map(), roomTitle: new Map(), researchDone: new Set(record.research.map((entry) => entry.id)) };
  for (const entry of [...record.research, ...(record.pendingResearch ?? [])]) {
    names.research.set(entry.id, entry.question);
    if (entry.roomId) names.roomToResearch.set(entry.roomId, entry.id);
  }
  for (const milestone of record.milestones) {
    const dispatch = milestone.dispatch;
    const kind = (dispatch ?? milestone.pendingDispatch)?.kind === 'room' ? 'room' : 'workflow';
    names.milestone.set(milestone.id, { title: milestone.title, kind, status: milestone.status });
    if (dispatch?.id) names.dispatchToMilestone.set(dispatch.id, milestone.id);
  }
  if (record.blockedOn?.kind === 'room' && record.blockedOn.title) names.roomTitle.set(record.blockedOn.id, record.blockedOn.title);
  return names;
}

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

interface Draft {
  node: ActivityNode;
  starts: number;
  lastStart: number;
  lastEnd: number;
  lastOutcome?: string;
}

/**
 * Builds the tree for one run from its folded records.
 *
 * `placeCharge` is returned too, so a detail page placed later lands its
 * charges under the same nodes this tree already shows.
 */
export function buildActivity(record: ProjectRecord, runId: string, records: readonly JournalRecord[], runOpen: boolean): {
  view: ActivityView;
  placeCharge(entry: JournalRecord): string;
  labelOf(nodeId: string): string;
} {
  const names = namesOf(record);
  const drafts = new Map<string, Draft>();
  const prefix = `${runId}:`;

  const ensure = (id: string, make: () => Omit<ActivityNode, 'startAt' | 'endAt' | 'state' | 'retries' | 'costUsd' | 'ownCostUsd' | 'charges' | 'tokens' | 'coverage'>): Draft => {
    let draft = drafts.get(id);
    if (!draft) {
      draft = {
        node: { ...make(), startAt: null, endAt: null, state: 'unknown', retries: 0, costUsd: null, ownCostUsd: null, charges: 0, tokens: null, coverage: null },
        starts: 0, lastStart: -1, lastEnd: -1,
      };
      drafts.set(id, draft);
    }
    return draft;
  };

  const milestoneNode = (milestoneId: string): string | null => {
    const known = names.milestone.get(milestoneId);
    if (!known) return null;
    const id = `${prefix}milestone:${milestoneId}`;
    ensure(id, () => ({ id, parentId: null, label: known.title, kind: 'milestone', group: known.kind === 'room' ? 'rooms' : 'workflows', synthetic: true, rawId: milestoneId }));
    return id;
  };
  const researchNode = (researchId: string): string => {
    const id = `${prefix}research:${researchId}`;
    ensure(id, () => ({ id, parentId: null, label: names.research.get(researchId) ?? researchId, kind: 'research', group: 'research', synthetic: true, rawId: researchId }));
    return id;
  };
  const groupNode = (kind: 'owner' | 'unassigned'): string => {
    const id = `${prefix}group:${kind}`;
    ensure(id, () => ({ id, parentId: null, label: kind === 'owner' ? 'Owner' : 'Unassigned', kind, group: kind, synthetic: true, rawId: kind }));
    return id;
  };
  const dispatchNode = (kind: string, dispatchId: string): string => {
    const milestoneId = names.dispatchToMilestone.get(dispatchId);
    const owner = milestoneId ? milestoneNode(milestoneId) : null;
    if (owner) return owner;
    const id = `${prefix}${kind}:${dispatchId}`;
    ensure(id, () => ({ id, parentId: null, label: names.roomTitle.get(dispatchId) ?? dispatchId, kind, group: GROUP_OF[kind] ?? 'unassigned', synthetic: true, rawId: dispatchId }));
    return id;
  };

  /** Where an operation the runtime opened belongs, when it did not say. */
  const inferParent = (operationId: string): string | null => {
    if (!operationId.startsWith(prefix)) return null;
    const [kind, subject] = operationId.slice(prefix.length).split(':');
    if (!kind || !subject || kind === 'research' || kind === 'milestone') return null;
    return names.milestone.has(subject) ? milestoneNode(subject) : null;
  };

  const operationLabel = (operationId: string, kind: string, waitCause?: string): string => {
    if (kind === 'wait') return (waitCause && WAIT_LABEL[waitCause]) ?? 'Waiting';
    if (kind === 'research') {
      const subject = operationId.startsWith(prefix) ? operationId.slice(prefix.length).split(':')[1] : undefined;
      return (subject && names.research.get(subject)) ?? operationId;
    }
    if (kind === 'owner-wake') {
      // `<run>:owner-wake:<wake kind>:<id>`. An older id has no kind.
      const reason = operationId.startsWith(prefix) ? WAKE_LABEL[operationId.slice(prefix.length).split(':')[1] ?? ''] : undefined;
      return reason ? `Owner wake · ${reason}` : 'Owner wake';
    }
    if (kind === 'workflow' && operationId.endsWith(':plan')) return 'Workflow plan';
    if (kind === 'evidence' && operationId.endsWith(':capture')) return 'Preview capture';
    return KIND_LABEL[kind] ?? operationId;
  };

  const placeCharge = (entry: JournalRecord): string => {
    const parent = str(entry.parentOperationId);
    if (parent) {
      if (!drafts.has(parent)) {
        const kind = parent.startsWith(prefix) ? parent.slice(prefix.length).split(':')[0] ?? 'unassigned' : 'unassigned';
        ensure(parent, () => ({ id: parent, parentId: inferParent(parent), label: operationLabel(parent, kind), kind, group: GROUP_OF[kind] ?? 'unassigned', synthetic: true, rawId: parent }));
      }
      return parent;
    }
    const source = str(entry.source) ?? '';
    const [head, second, third] = source.split(':');
    if (head === 'owner') return groupNode('owner');
    if (head === 'room-planning' && second === 'research' && third) return researchNode(third);
    if (head === 'room-planning' && second === 'dispatch' && third) return milestoneNode(third) ?? groupNode('unassigned');
    if (head === 'room' && second) {
      const research = names.roomToResearch.get(second);
      return research ? researchNode(research) : dispatchNode('room', second);
    }
    if (head === 'dispatch' && second && third) return dispatchNode(second === 'room' ? 'room' : 'workflow', third);
    return groupNode('unassigned');
  };

  let first: string | null = null;
  let last: string | null = null;
  const charges: { entry: JournalRecord; nodeId: string }[] = [];
  for (const entry of records) {
    if (typeof entry.at === 'string') {
      if (first === null || entry.at < first) first = entry.at;
      if (last === null || entry.at > last) last = entry.at;
    }
    const operationId = str(entry.operationId);
    if (entry.recordKind === 'operation-start' && operationId) {
      const kind = str(entry.operationKind) ?? 'unassigned';
      const waitCause = str(entry.waitCause);
      const draft = ensure(operationId, () => ({
        id: operationId,
        parentId: str(entry.parentOperationId) ?? inferParent(operationId),
        label: operationLabel(operationId, kind, waitCause),
        kind,
        group: GROUP_OF[kind] ?? 'unassigned',
        synthetic: false,
        rawId: operationId,
      }));
      // A group made earlier for this id becomes the real operation.
      draft.node.synthetic = false;
      draft.node.kind = kind;
      if (waitCause) draft.node.waitCause = waitCause;
      if (str(entry.model)) draft.node.model = str(entry.model);
      if (str(entry.thinking)) draft.node.thinking = str(entry.thinking);
      draft.starts += 1;
      draft.lastStart = entry.seq;
      if (!draft.node.startAt || entry.at < draft.node.startAt) draft.node.startAt = entry.at;
    } else if (entry.recordKind === 'operation-end' && operationId) {
      const draft = drafts.get(operationId);
      if (!draft) continue;
      draft.lastEnd = entry.seq;
      draft.lastOutcome = str(entry.outcome);
      draft.node.endAt = entry.at;
      if (str(entry.error)) draft.node.error = str(entry.error);
    } else if (entry.kind === 'usage') {
      charges.push({ entry, nodeId: placeCharge(entry) });
    }
  }

  for (const draft of drafts.values()) {
    const node = draft.node;
    node.retries = Math.max(0, draft.starts - 1);
    if (node.synthetic) {
      node.state = groupState(node, names, runOpen);
      continue;
    }
    if (draft.lastEnd > draft.lastStart) {
      node.state = draft.lastOutcome === 'failed' ? 'failed' : draft.lastOutcome === 'aborted' ? 'aborted' : draft.lastOutcome === 'ok' ? 'done' : 'unknown';
    } else {
      // Started and not ended: work in progress while the run is open, and
      // unknown after it, because a crash does not look like completion.
      node.state = runOpen ? (node.kind === 'wait' ? 'waiting' : 'running') : 'unknown';
      node.endAt = null;
    }
  }

  const spend = accumulate(drafts, charges);
  const nodes = [...drafts.values()].map((draft) => draft.node);
  return {
    view: {
      nodes,
      spend: sample(spend),
      byGroup: byGroup(drafts, charges),
      byModel: byModel(drafts, charges),
      counters: {
        ownerTurns: nodes.filter((node) => node.kind === 'owner-wake').length,
        failures: nodes.filter((node) => node.state === 'failed').length,
        retries: nodes.reduce((sum, node) => sum + node.retries, 0),
        waits: nodes.filter((node) => node.kind === 'wait').length,
      },
      elapsed: first && last ? { from: first, to: last } : null,
    },
    placeCharge,
    labelOf: (nodeId) => drafts.get(nodeId)?.node.label ?? nodeId,
  };
}

/**
 * A group's state comes from what the record says about the thing it groups.
 * Charges alone prove only that money was spent, not that the work finished.
 */
function groupState(node: ActivityNode, names: Names, runOpen: boolean): ActivityState {
  const live: ActivityState = runOpen ? 'running' : 'unknown';
  if (node.kind === 'milestone') {
    const status = names.milestone.get(node.rawId)?.status;
    if (status === 'done') return 'done';
    if (status === 'parked') return 'waiting';
    return status === 'running' || status === 'verifying' || status === 'approved' ? live : 'unknown';
  }
  if (node.kind === 'research') return names.researchDone.has(node.rawId) ? 'done' : live;
  // Owner and Unassigned hold settled charges; a charge that exists was made.
  return node.kind === 'owner' || node.kind === 'unassigned' ? 'done' : 'unknown';
}

function tokensOf(entry: JournalRecord): TokenSet | null {
  const usage = entry.usage;
  if (typeof usage !== 'object' || usage === null) return null;
  const read = (key: string): number | undefined => {
    const value = (usage as Record<string, unknown>)[key];
    return typeof value === 'number' ? value : undefined;
  };
  const input = read('inputTokens');
  const output = read('outputTokens');
  const cacheRead = read('cacheReadTokens');
  const cacheWrite = read('cacheWriteTokens');
  if (input === undefined && output === undefined && cacheRead === undefined && cacheWrite === undefined) return null;
  return { input: input ?? 0, output: output ?? 0, cacheRead: cacheRead ?? 0, cacheWrite: cacheWrite ?? 0 };
}

function addTokens(into: TokenSet | null, add: TokenSet | null): TokenSet | null {
  if (!add) return into;
  if (!into) return { ...add };
  return { input: into.input + add.input, output: into.output + add.output, cacheRead: into.cacheRead + add.cacheRead, cacheWrite: into.cacheWrite + add.cacheWrite };
}

/**
 * Rolls each charge up its ancestors, so every node's cost is inclusive and a
 * parent is never added to a total next to its children. Returns the charges
 * in time order for the spend line.
 */
function accumulate(drafts: Map<string, Draft>, charges: { entry: JournalRecord; nodeId: string }[]): { at: string; usd: number }[] {
  const models = new Map<string, Set<string>>();
  const coverages = new Map<string, Set<string>>();
  for (const { entry, nodeId } of charges) {
    const cost = typeof entry.costUsd === 'number' ? entry.costUsd : null;
    const tokens = tokensOf(entry);
    const own = drafts.get(nodeId);
    if (own) {
      own.node.charges += 1;
      if (cost !== null) own.node.ownCostUsd = (own.node.ownCostUsd ?? 0) + cost;
    }
    const seen = new Set<string>();
    for (let id: string | null = nodeId; id && !seen.has(id); id = drafts.get(id)?.node.parentId ?? null) {
      seen.add(id);
      const draft = drafts.get(id);
      if (!draft) break;
      if (cost !== null) draft.node.costUsd = (draft.node.costUsd ?? 0) + cost;
      draft.node.tokens = addTokens(draft.node.tokens, tokens);
      const model = str(entry.model);
      if (model) models.set(id, (models.get(id) ?? new Set()).add(model));
      coverages.set(id, (coverages.get(id) ?? new Set()).add(entry.coverage === 'call' ? 'call' : 'aggregate'));
      // A synthetic group spans the charges under it, and no more.
      if (draft.node.synthetic) {
        if (!draft.node.startAt || entry.at < draft.node.startAt) draft.node.startAt = entry.at;
        if (!draft.node.endAt || entry.at > draft.node.endAt) draft.node.endAt = entry.at;
      }
    }
  }
  for (const [id, draft] of drafts) {
    const set = coverages.get(id);
    draft.node.coverage = !set ? null : set.size > 1 ? 'partial' : set.has('call') ? 'call' : 'aggregate';
    const used = models.get(id);
    // A group whose charges all used one model says so; a mix says nothing.
    if (!draft.node.model && used?.size === 1) draft.node.model = [...used][0];
  }
  let running = 0;
  return [...charges]
    .filter(({ entry }) => typeof entry.costUsd === 'number')
    .sort((a, b) => (a.entry.at < b.entry.at ? -1 : a.entry.at > b.entry.at ? 1 : a.entry.seq - b.entry.seq))
    .map(({ entry }) => ({ at: entry.at, usd: (running += entry.costUsd as number) }));
}

/** Keeps the line's shape within a fixed number of points, always ending on the total. */
function sample(points: { at: string; usd: number }[]): { at: string; usd: number }[] {
  if (points.length <= SPEND_POINTS) return points;
  const step = points.length / SPEND_POINTS;
  const kept: { at: string; usd: number }[] = [];
  for (let index = 1; index <= SPEND_POINTS; index += 1) kept.push(points[Math.min(points.length - 1, Math.round(index * step) - 1)]!);
  return kept;
}

function byGroup(drafts: Map<string, Draft>, charges: { entry: JournalRecord; nodeId: string }[]): ActivityView['byGroup'] {
  const totals = new Map<ActivityGroup, { usd: number; tokens: TokenSet | null }>();
  for (const { entry, nodeId } of charges) {
    const group = drafts.get(nodeId)?.node.group ?? 'unassigned';
    const current = totals.get(group) ?? { usd: 0, tokens: null };
    totals.set(group, {
      usd: current.usd + (typeof entry.costUsd === 'number' ? entry.costUsd : 0),
      tokens: addTokens(current.tokens, tokensOf(entry)),
    });
  }
  return [...totals].map(([group, value]) => ({ group, ...value })).sort((a, b) => b.usd - a.usd);
}

function byModel(drafts: Map<string, Draft>, charges: { entry: JournalRecord; nodeId: string }[]): ActivityView['byModel'] {
  const totals = new Map<string | null, number>();
  for (const { entry, nodeId } of charges) {
    const model = str(entry.model) ?? drafts.get(nodeId)?.node.model ?? null;
    totals.set(model, (totals.get(model) ?? 0) + (typeof entry.costUsd === 'number' ? entry.costUsd : 0));
  }
  return [...totals].map(([model, usd]) => ({ model, usd })).sort((a, b) => b.usd - a.usd);
}
