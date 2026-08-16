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
}

/** The host-issued grant. A runtime only ever holds `grantId`. */
export interface PersistentSessionGrantHandle {
  grantId: string;
  /** The clamped, approved policy set — so the caller can see what it actually got. */
  subjects: Record<string, PersistentSessionSubjectPolicy>;
  maxLiveSessions: number;
  maxTotalSessions: number;
  issuedAt: string;
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
  /**
   * Turns this session has completed since it was opened. A turn is one prompt
   * and its whole reply — not a message and not a model call — so a caller that
   * needs a lifetime total counts its own prompts rather than reading this.
   */
  turns: number;
}

/** One streamed event from a live session. Transient — never persisted by the host. */
export type PersistentSessionEvent =
  | { type: 'turn_start'; turnId: string }
  | { type: 'text'; text: string }
  | { type: 'tool_start'; toolName: string; summary: string }
  | { type: 'tool_end'; toolName: string; ok: boolean }
  | { type: 'turn_end'; turnId: string; status: 'completed' | 'aborted' | 'error' }
  | { type: 'compacted' };

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
  revokeGrant(grantId: string): Promise<void>;
  /** Revokes the grant, then removes its transcripts and durable metadata. Idempotent. */
  deleteGrant(grantId: string): Promise<void>;

  create(request: PersistentSessionRequest): Promise<PersistentSessionHandle>;
  open(request: PersistentSessionRequest): Promise<PersistentSessionHandle>;

  prompt(handleId: string, content: ExtensionRuntimeContent): Promise<{ turnId: string }>;
  steer(handleId: string, content: ExtensionRuntimeContent): Promise<void>;
  abort(handleId: string): Promise<void>;
  /** Live stream. Transient view state — the host persists none of it. */
  subscribe(handleId: string, cb: (event: PersistentSessionEvent) => void): () => void;
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
