/**
 * Persistent agent sessions for background app runtimes (AD-029).
 *
 * A runtime cannot construct a Pi session itself — it asks the host, and the
 * host validates every request against a grant it issued and stores. This
 * contract is deliberately GENERIC: `owner`, `scope` and `subject` are opaque
 * strings the host never parses. Nothing here may import or depend on a domain
 * type from the calling product (Agent Rooms uses its Room and member IDs as
 * values; another product could use anything).
 *
 * Threat model (architecture.md §3.0): this boundary contains a DEFECTIVE API
 * caller and all third-party code. It does not contain a compromised bundled
 * runtime, which executes in Electron main with full Node authority.
 */

import type {
  PersistentSessionGrantAmendment,
  PersistentSessionGrantAmendmentResult,
} from './app-runtime-persistent-session-amendments';
import type { ExtensionRuntimeContent } from './session-runtime';

/**
 * What a session may reach. Every field is a total order, so "within" is a
 * per-field index comparison — there is no lattice ambiguity. A field the
 * caller omits is treated as `none`, never as inherited.
 */
export interface PersistentSessionPermissionProfile {
  filesystem: 'none' | 'read' | 'write';
  commands: 'none' | 'readOnly' | 'all';
  network: 'none' | 'fetch';
  vcs: 'none' | 'read' | 'commit' | 'push';
}

/**
 * What ONE session subject may do. Policy is per subject, never grant-wide:
 * with a single flat capability list a read-only subject could request a
 * capability that only a different subject was approved for, and the union
 * check would pass it.
 */
export interface PersistentSessionSubjectPolicy {
  /** Working directories this subject may use. Compared after symlink resolution. */
  allowedCwds: string[];
  /** Model IDs. Must also be resolvable through the host ModelRuntime at request time. */
  allowedModels: string[];
  allowedTools: string[];
  allowedSkills: string[];
  /**
   * Thinking levels this subject may run at. Caller-selectable settings that
   * move cost must be in the policy — otherwise a defective caller could run
   * every turn at the highest level and blow the approved spend.
   */
  allowedThinkingLevels: string[];
  /**
   * Applied VERBATIM to the session. A request carries no permission profile of
   * its own, so there is no subset negotiation and nothing for a caller to
   * inflate.
   */
  permissionProfile: PersistentSessionPermissionProfile;
  /** Cap on appended system-prompt text. Additions never replace the base prompt. */
  maxSystemPromptAdditionBytes: number;
}

/**
 * Authority one approval may pass on to linked grants.
 *
 * A grant proposal that carries this asks the user to approve, in the same
 * dialog, what later grants for the same owner and scope may hold. The host
 * clamps it like any proposal, stores it as an immutable policy and returns its
 * id. It bounds permitted execution only: it names no team and no workflow.
 */
export interface PersistentSessionDelegationProposal {
  /**
   * Apps whose grant proposals may name the stored policy. Each must itself
   * pass the bundled-plugin gate; the host drops any that does not.
   */
  delegateAppIds: string[];
  /**
   * The most authority a linked subject may hold, per role. A linked subject is
   * accepted only when it fits inside one role, and it keeps its own narrower
   * policy: a read-only subject stays read-only when another role may edit.
   */
  roles: Record<string, PersistentSessionSubjectPolicy>;
  /** Across every grant issued under the policy, not per grant. */
  maxLiveSessions: number;
  maxTotalSessions: number;
}

/** The clamped policy the host stored, so the caller can record what was approved. */
export interface PersistentSessionDelegationPolicy extends PersistentSessionDelegationProposal {
  policyId: string;
  workspaceId: string;
  issuedAt: string;
}

/**
 * What a runtime ASKS for. This is an input to a user approval, never a source
 * of authority: the host clamps it to current user authority and the real
 * workspace capability catalogue, has the user approve the clamped set, and
 * stores that. A runtime can never widen a grant it already holds.
 */
export interface PersistentSessionGrantProposal {
  /** Opaque caller-defined identifiers. The host stores them and never parses them. */
  owner: string;
  scope: string;
  workspaceId: string;
  /** Per-subject policy, keyed by opaque subject id. */
  subjects: Record<string, PersistentSessionSubjectPolicy>;
  maxLiveSessions: number;
  maxTotalSessions: number;
  /** Shown to the user at approval time. Plain language, no secrets. */
  reason: string;
  /** Asks this approval to also cover linked grants. See the type. */
  delegation?: PersistentSessionDelegationProposal;
  /**
   * Names a stored delegation policy. When the clamped proposal fits inside it,
   * the host records the grant without another approval and binds the grant to
   * the policy. A proposal that does not fit is approved by the user as usual.
   * A revoked policy refuses the grant.
   */
  delegationPolicyId?: string;
}

/** The host-issued grant. A runtime only ever holds `grantId`. */
export interface PersistentSessionGrantHandle {
  grantId: string;
  /** The clamped, approved policy set — so the caller can see what it actually got. */
  subjects: Record<string, PersistentSessionSubjectPolicy>;
  maxLiveSessions: number;
  maxTotalSessions: number;
  issuedAt: string;
  /** Counts applied amendments. Absent on a grant that was never amended means 0. */
  revision?: number;
  /** Subjects that start no more sessions. */
  retired?: string[];
  /** Present when the approved proposal carried a delegation. */
  delegation?: PersistentSessionDelegationPolicy;
  /** Present when the grant was issued under a stored policy, without a dialog. */
  delegatedByPolicyId?: string;
}

export type PersistentSessionOperation = 'create' | 'open';

export interface PersistentSessionRequest {
  grantId: string;
  subject: string;
  operation: PersistentSessionOperation;
  cwd: string;
  model: string;
  /** Must be in the subject's `allowedThinkingLevels`. Omitted means the host default. */
  thinking?: string;
  tools: string[];
  skills: string[];
  /** Appended AFTER the base prompt and host-required blocks. Size-bounded per subject. */
  systemPromptAdditions?: string[];
  /** Deterministic Pi session name. Also the Usage plugin's grouping input. */
  sessionName: string;
  // No path field, for either operation. `create` lets Pi name the file inside
  // the grant's session directory; `open` resolves it from the host's own
  // immutable subject-to-path registry. A caller that cannot name a path cannot
  // aim one — this removes path traversal and leaf-symlink attacks by
  // construction rather than by validation.
}

export interface PersistentSessionHandle {
  /** Host-issued. Every later operation re-checks that its grant is still active. */
  handleId: string;
  subject: string;
  sessionId: string;
  /** Absolute path of the Pi JSONL session file. */
  sessionPath: string;
}

export interface PersistentSessionContextUsage {
  usedTokens: number;
  maxTokens: number;
}

export interface PersistentSessionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  /** True when the SDK could not provide a complete usage snapshot. */
  incomplete?: boolean;
  /**
   * Turns this session has completed since it was opened. A turn is one prompt
   * and its whole reply — not a message and not a model call — so a caller that
   * needs a lifetime total counts its own prompts rather than reading this.
   */
  turns: number;
}

/**
 * One streamed event from a live session. Transient — never persisted by the host.
 *
 * `at` is the host clock when the host observed the event. A reader derives
 * active intervals from consecutive events, so a long gap between two events is
 * a gap, never active work.
 *
 * Reasoning text is deliberately absent from this union: a watcher may know what
 * a session is doing, not what it is thinking.
 */
export type PersistentSessionEvent =
  | { type: 'turn_start'; turnId: string; at: string }
  | { type: 'text'; text: string }
  /**
   * One model request. The id is the SDK's message identity when it reports one,
   * so two requests inside a single turn stay apart. The SDK exposes no
   * first-token event, so none is reported.
   */
  | { type: 'request_start'; requestId: string | null; model?: string; at: string }
  | { type: 'request_end'; requestId: string | null; outcome: 'ok' | 'failed'; at: string }
  | { type: 'tool_start'; toolName: string; summary: string; callId: string | null; at: string }
  | { type: 'tool_end'; toolName: string; ok: boolean; callId: string | null; at: string }
  | { type: 'turn_end'; turnId: string; status: 'completed' | 'aborted' | 'error'; errorMessage?: string; at: string }
  | { type: 'compacted'; at: string };

/**
 * Where a live session's current turn stands. Kept by the host while the turn
 * runs, whether or not anything watches, so a view opened late starts from the
 * text already written instead of from nothing. Bounded, transient and cleared
 * when the turn ends: the finished reply is in the session history.
 *
 * It holds answer text and tool labels, so it is for the app that holds the
 * handle. Reasoning text is never in it.
 */
export interface PersistentSessionLiveSnapshot {
  /** The turn in flight, or null between turns. */
  turnId: string | null;
  /** The newest text of this turn's answer, cut from the front when long. */
  text: string;
  truncated: boolean;
  /** The model request open now. */
  request: { requestId: string | null; model?: string; startedAt: string } | null;
  /** The tool running now. */
  tool: { toolName: string; summary: string; callId: string | null; startedAt: string } | null;
  /** Counts up with every change, so a reader can order two snapshots. */
  revision: number;
  updatedAt: string | null;
}

/** One page of a session's history, read from the Pi session file on demand. */
export interface PersistentSessionHistoryPage {
  entries: PersistentSessionHistoryEntry[];
  /** Cursor for the next older page; null when the start of the file is reached. */
  olderCursor: string | null;
}

export interface PersistentSessionHistoryEntry {
  turnIndex: number;
  timestamp: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  text: string;
  /** True for a Pi compaction boundary, so the UI can mark it in place. */
  compactionBoundary?: boolean;
}

export interface PersistentSessionsApi {
  /**
   * Proposes a grant. The host clamps it, gets user approval, stores the
   * approved set, and returns a handle. Rejects when the calling plugin is not
   * a permitted built-in, or when the user declines.
   */
  requestGrant(proposal: PersistentSessionGrantProposal): Promise<PersistentSessionGrantHandle>;
  /** Aborts in-flight turns, disposes live sessions, and fails every later request. Idempotent. */
  /** Changes an existing grant in place. See `PersistentSessionGrantAmendment`. */
  amendGrant(amendment: PersistentSessionGrantAmendment): Promise<PersistentSessionGrantAmendmentResult>;
  revokeGrant(grantId: string): Promise<void>;
  /** Revokes the grant, then removes its transcripts and durable metadata. Idempotent. */
  deleteGrant(grantId: string): Promise<void>;
  /**
   * Revokes a delegation policy this app was issued, and every grant issued
   * under it, on the same rules as `revokeGrant`. Idempotent.
   */
  revokeDelegationPolicy(policyId: string): Promise<void>;

  create(request: PersistentSessionRequest): Promise<PersistentSessionHandle>;
  open(request: PersistentSessionRequest): Promise<PersistentSessionHandle>;

  prompt(handleId: string, content: ExtensionRuntimeContent): Promise<{ turnId: string }>;
  steer(handleId: string, content: ExtensionRuntimeContent): Promise<void>;
  abort(handleId: string): Promise<void>;
  /** Live stream. Transient view state — the host persists none of it. */
  subscribe(handleId: string, cb: (event: PersistentSessionEvent) => void): () => void;
  /**
   * The current turn so far. A caller that subscribes first and reads this
   * second misses nothing: the snapshot covers what was sent before the
   * subscription. Null when the handle is not live.
   */
  liveSnapshot(handleId: string): PersistentSessionLiveSnapshot | null;
  compact(handleId: string): Promise<void>;
  getContextUsage(handleId: string): Promise<PersistentSessionContextUsage>;
  getSessionUsage(handleId: string): Promise<PersistentSessionUsage>;
  /** Closes the live session. Does NOT delete the file or clear the subject binding. */
  dispose(handleId: string): Promise<void>;

  /**
   * Reads a page of a subject's history from the tail, so opening a long
   * session never loads the whole file. Works for a disposed subject — history
   * outlives the live session.
   */
  readHistory(
    grantId: string,
    subject: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<PersistentSessionHistoryPage>;
}
