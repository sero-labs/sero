/**
 * Run observation contracts (spec architect-run-observability).
 *
 * These types describe what a host adapter may report about real execution.
 * They are metadata only by construction: there is no field for a prompt, a
 * tool argument, a tool result or reasoning text, so an adapter cannot leak one
 * by accident.
 *
 * Grounded in the installed Pi SDK (`@earendil-works/pi-agent-core` 0.85.1):
 *
 * - `AgentEvent` carries `agent_start`, `agent_end`, `turn_start`, `turn_end`,
 *   `message_start`, `message_update`, `message_end`, `tool_execution_start`,
 *   `tool_execution_update` and `tool_execution_end`.
 * - Tool identity is `toolCallId`. Matching by tool name would merge two
 *   parallel calls to the same tool, so the contract requires the id.
 * - Turn identity comes from `turn_start` / `turn_end`.
 * - `Usage` carries `input`, `output`, `cacheRead`, `cacheWrite`,
 *   `cacheWrite1h`, `reasoning` and per-category cost, so cache splits are
 *   available rather than derived.
 * - The SDK exposes NO first-token or generation-duration event. The contract
 *   therefore requires those to be reported as unavailable, never inferred
 *   from text-delta timing.
 * - `compaction_end` is a session-level event, not part of `AgentEvent`.
 *
 * A value the source does not measure is absent or explicitly unavailable.
 * It is never zero, and it is never reconstructed.
 */

/** Which semantic operation a span belongs to. Set by the runtime, not a model. */
export type ObservationOperationKind =
  | 'owner-wake'
  | 'research'
  | 'planning'
  | 'room'
  | 'room-member'
  | 'workflow'
  | 'workflow-step'
  | 'workflow-attempt'
  | 'trigger-extraction'
  | 'repair'
  | 'evaluation'
  | 'evidence'
  | 'delivery'
  | 'subagent-run'
  | 'auxiliary';

/** Identities stay distinct. A session outlives turns; a turn contains requests. */
export interface ObservationIdentities {
  /** Stable span identity, minted by the runtime that opened the span. */
  operationId: string;
  /** Container span, when containment is real. */
  parentOperationId?: string;
  /** Cross-agent handoff, when one operation handed work to another. */
  linkedOperationIds?: string[];
  /** The owning project and run. */
  projectId?: string;
  runId?: string;
  /** The persistent session, which can span several turns and several runs. */
  sessionId?: string;
  /** One prompt and its whole reply. */
  turnId?: string;
  /** One Orchestrator step attempt. */
  attemptId?: string;
  /** One model request. Distinct from the turn that contains it. */
  requestId?: string;
  /** One tool call. The SDK's `toolCallId`, so parallel same-name calls stay apart. */
  toolCallId?: string;
}

/** Tokens and cost, in the SDK's own categories. */
export interface ObservationUsage {
  inputTokens?: number;
  outputTokens?: number;
  /** Subset of `outputTokens` when the provider reports it. Never inlined reasoning. */
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Subset of `cacheWriteTokens` written with one-hour retention, when reported. */
  cacheWrite1hTokens?: number;
  /** Reported cost in USD. Absent when the model is unpriced. */
  costUsd?: number;
  /**
   * True when the source could not provide a complete snapshot: an interrupted
   * call, an unpriced model, or a provider without the counter.
   */
  incomplete?: boolean;
  /** Counter names the provider does not report, so a reader never reads zero as measured. */
  unavailable?: readonly (keyof ObservationUsage)[];
}

/** What kind of observation one record is. */
export type ObservationRecordKind =
  | 'operation-start'
  | 'operation-end'
  | 'request-start'
  | 'request-end'
  | 'tool-start'
  | 'tool-end'
  | 'turn-start'
  | 'turn-end'
  | 'compaction';

export type ObservationOutcome = 'ok' | 'failed' | 'aborted' | 'unknown';

/**
 * One observation. Timestamps are ISO strings from the host clock; a missing end
 * means the operation is still open, and a missing timestamp means the source
 * did not report one.
 */
export interface ObservationRecord {
  kind: ObservationRecordKind;
  identities: ObservationIdentities;
  /** ISO timestamp the observation started, when the source reports one. */
  startedAt?: string;
  endedAt?: string;
  /** The model that actually ran, and the thinking level it ran with. */
  model?: string;
  thinking?: string;
  outcome?: ObservationOutcome;
  usage?: ObservationUsage;
  /** Provider or SDK error text. Never a prompt or a payload. */
  error?: string;
}

/** Timing a host adapter reports only when the SDK measures it. */
export interface ObservationTiming {
  /** Milliseconds to first streamed token. Absent: the SDK reports no such event. */
  firstTokenMs?: number;
  /** Milliseconds the model was generating, excluding surrounding tool work. */
  generationMs?: number;
}

/**
 * Why a measurement is missing. A reader shows this instead of a zero.
 */
export type ObservationGap =
  | 'no-first-token-event'
  | 'no-cache-counters'
  | 'no-reasoning-breakdown'
  | 'unpriced-model'
  | 'call-interrupted'
  | 'no-message-identity'
  | 'no-tool-identity';

/**
 * What the installed SDK cannot measure, so every adapter reports the same
 * gaps rather than inventing per-adapter behaviour.
 */
export const SDK_OBSERVATION_GAPS: readonly ObservationGap[] = [
  // `AgentEvent` has no first-token or generation-duration event.
  'no-first-token-event',
];

/** The numeric counters of `ObservationUsage`. */
export type NumericUsageKey =
  | 'inputTokens'
  | 'outputTokens'
  | 'reasoningTokens'
  | 'cacheReadTokens'
  | 'cacheWriteTokens'
  | 'cacheWrite1hTokens'
  | 'costUsd';

/**
 * Reads the SDK `Usage` shape into the contract, keeping its categories apart.
 * A category the provider omitted is listed as unavailable rather than zero.
 */
export function toObservationUsage(usage: {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cacheWrite1h?: number;
  reasoning?: number;
  cost?: { total?: number };
} | undefined): ObservationUsage | undefined {
  if (!usage) return undefined;
  const unavailable: (keyof ObservationUsage)[] = [];
  const out: ObservationUsage = {};
  // Only the numeric counters can be copied straight across; the flags below
  // are derived from which counters the provider actually reported.
  const take = (raw: number | undefined, name: NumericUsageKey): void => {
    if (typeof raw === 'number') out[name] = raw;
    else unavailable.push(name);
  };
  take(usage.input, 'inputTokens');
  take(usage.output, 'outputTokens');
  take(usage.reasoning, 'reasoningTokens');
  take(usage.cacheRead, 'cacheReadTokens');
  take(usage.cacheWrite, 'cacheWriteTokens');
  take(usage.cacheWrite1h, 'cacheWrite1hTokens');
  take(usage.cost?.total, 'costUsd');
  if (unavailable.length) {
    out.unavailable = unavailable;
    out.incomplete = true;
  }
  return out;
}

/**
 * True when a record carries nothing that could hold a prompt, a tool payload,
 * a tool result or reasoning text. Adapters use it as a boundary check: a
 * record that fails it must be dropped, not sanitised.
 */
export function isMetadataOnly(record: ObservationRecord): boolean {
  const allowed = new Set([
    'kind', 'identities', 'startedAt', 'endedAt', 'model', 'thinking', 'outcome', 'usage', 'error',
  ]);
  for (const key of Object.keys(record)) if (!allowed.has(key)) return false;
  for (const key of Object.keys(record.identities)) {
    if (!(key in { operationId: 1, parentOperationId: 1, linkedOperationIds: 1, projectId: 1, runId: 1, sessionId: 1, turnId: 1, attemptId: 1, requestId: 1, toolCallId: 1 })) {
      return false;
    }
  }
  const usage = record.usage;
  if (!usage) return true;
  const usageKeys = new Set([
    'inputTokens', 'outputTokens', 'reasoningTokens', 'cacheReadTokens', 'cacheWriteTokens',
    'cacheWrite1hTokens', 'costUsd', 'incomplete', 'unavailable',
  ]);
  return Object.keys(usage).every((key) => usageKeys.has(key));
}
