/**
 * OrchestratorHost — the seam the coordinator and runtime modules depend on.
 *
 * It wraps the desktop `AppRuntimeHost` plus a few deterministic utilities
 * (clock, id generator, logger). Tests construct a fake implementation; the
 * real implementation lives in host-adapter.ts.
 *
 * The interface grows phase by phase as execution, workspace, scheduling, and
 * active-session capabilities come online.
 */

import type {
  ExtensionRuntimeContent,
  ExtensionRuntimeMessage,
} from '@sero-ai/common';
import type { OrchestratorState } from '../shared/types';

export interface ActiveSessionInfo {
  sessionId: string;
  workspaceId: string;
}

export interface SessionState {
  idle: boolean;
  pendingMessages: number;
  activeTurnId: string | null;
}

export type TurnStatus = 'completed' | 'aborted' | 'error';

export interface TurnResult {
  turnId: string;
  status: TurnStatus;
}

/** Active-session control (Orchestrator active-session steps). */
export interface SessionHost {
  getActiveForWorkspace(workspaceId: string): Promise<ActiveSessionInfo | null>;
  getState(sessionId: string): Promise<SessionState>;
  sendUserSteer(
    sessionId: string,
    content: ExtensionRuntimeContent,
    options: { deliverAs: 'steer' | 'followUp'; source: 'orchestrator' },
  ): Promise<{ turnId: string }>;
  sendContextMessage(
    sessionId: string,
    message: ExtensionRuntimeMessage,
    options: { deliverAs: 'steer' | 'followUp' | 'nextTurn'; triggerTurn: boolean; source: 'orchestrator' },
  ): Promise<{ turnId: string | null }>;
  onTurnComplete(sessionId: string, cb: (result: TurnResult) => void): () => void;
}

/** Parameters for a model / background-agent run (subset of the host seam). */
export interface ModelRunParams {
  task: string;
  systemPrompt?: string;
  model?: string;
  thinking?: string;
  parentSessionId: string;
  /** Working directory for filesystem-backed runs (background agents). */
  cwd?: string;
  /** Tool surface: 'none' for pure model calls, 'all' for background agents. */
  platformTools?: 'all' | 'readOnly' | 'none';
  signal?: AbortSignal;
  onUpdate?: (text: string) => void;
}

export interface ModelRunUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ModelRunResult {
  response: string;
  error?: string;
  modelId?: string;
  providerId?: string;
  durationMs?: number;
  usage?: ModelRunUsage;
}

export interface WorktreeHandle {
  worktreePath: string;
  branchName: string;
}

export interface WorkspaceStatus {
  isGitRepository: boolean;
  hasUncommittedChanges: boolean;
  summary: string;
}

export interface ChoiceRequest {
  title: string;
  body: string;
  choices: { id: string; label: string }[];
  timeoutMs: number;
}

export interface ChoiceResult {
  choiceId: string | null;
  timedOut: boolean;
}

export interface OrchestratorHost {
  /** Workspace this host (and its coordinator) is scoped to. */
  readonly workspaceId: string;
  /** Absolute registered workspace root. */
  readonly workspacePath: string;
  /** Absolute directory that holds state.json and the artifacts/ subtree. */
  readonly stateDir: string;

  // ── State persistence (authoritative state file) ──────────
  readState(): Promise<OrchestratorState | null>;
  updateState(updater: (current: OrchestratorState) => OrchestratorState): Promise<void>;

  // ── Model / agent execution (standard Sero runtime) ───────
  /** Runs a model or background agent and returns plain text plus metadata. */
  runStructured(params: ModelRunParams): Promise<ModelRunResult>;

  // ── Artifacts (large outputs under the state dir) ─────────
  /** Persists artifact content and returns a stable reference (path). */
  writeArtifact(relativePath: string, content: string): Promise<string>;
  /** Reads artifact content by the reference returned from writeArtifact. */
  readArtifact(ref: string): Promise<string | null>;

  // ── Workspace isolation (user-selected placement) ─────────
  /** Creates or reuses one managed worktree for a loop. */
  createWorktree(loopId: string, title: string): Promise<WorktreeHandle>;
  removeWorktree(loopId: string, options?: { deleteBranch?: boolean; force?: boolean }): Promise<void>;
  /** Workspace-root dirty preflight (workspace-root mode only). */
  getWorkspaceStatus(): Promise<WorkspaceStatus>;
  /** Stashes current workspace changes after an explicit user choice. */
  stashWorkspaceChanges(message: string): Promise<{ stashRef: string | null }>;

  // ── Notifications ─────────────────────────────────────────
  notify(message: string, type?: 'info' | 'warning' | 'error'): void;
  /** Visible choice notification with timeout fallback. */
  requestChoice(request: ChoiceRequest): Promise<ChoiceResult>;

  // ── Active-session control ────────────────────────────────
  session: SessionHost;

  // ── Deterministic utilities ───────────────────────────────
  /** ISO timestamp. Injectable so tests are deterministic. */
  now(): string;
  /** Unique id with an optional prefix. Injectable for deterministic tests. */
  newId(prefix?: string): string;
  /** Diagnostic logging. */
  log(message: string): void;
}
