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
  AppRuntimeCommandResult,
  AppRuntimePullRequestSummary,
  AppRuntimeSubagentRepair,
  ContextAgentInfo,
  ContextToolInfo,
  ExtensionRuntimeContent,
  ExtensionRuntimeMessage,
  SharedAvailableModelGroup,
} from '@sero-ai/common';
import type {
  CatalogEntry,
  CatalogRefreshResult,
  CatalogRepoContents,
  CatalogRepoRef,
} from '../shared/catalog-types';
import type { LibraryEntry, LibraryIndex, LibraryVersion, OrchestratorState } from '../shared/types';

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
  ): Promise<{ turnId: string | null }>;
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
  /** Named agent role to run as (one of the workspace agents). Omitted ⇒ ad-hoc. */
  agent?: string;
  /** Step suffix appended after the base prompt (the orchestrator's step contract). */
  systemPrompt?: string;
  /**
   * Prompt sections appended AFTER the resolved agent body — used to carry the
   * step contract on top of a named agent's `.md` body (which the ad-hoc
   * `systemPrompt` channel can't, since a named agent displaces it).
   */
  appendSystemPrompt?: string[];
  /** Replaces the base Sero system prompt for this run (user context override). '' excludes it. */
  systemPromptOverride?: string;
  model?: string;
  thinking?: string;
  parentSessionId: string;
  /** Working directory for filesystem-backed runs (background agents). */
  cwd?: string;
  /** Tool surface: 'none' for pure model calls, 'all' for background agents. */
  platformTools?: 'all' | 'readOnly' | 'none';
  /** Per-step allowlist: tool names this run may use. When set, only these are active. */
  tools?: string[];
  /** User context override: tool names to remove from this run's surface. */
  disabledTools?: string[];
  /** User context override: skill names to hide from the model for this run. */
  disabledSkills?: string[];
  signal?: AbortSignal;
  /** In-session structured-output repair: re-prompt the SAME session for a valid reply. */
  repair?: AppRuntimeSubagentRepair;
  onUpdate?: (text: string) => void;
}

export interface ModelRunUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Run cost in USD, when the model has known pricing. */
  costUsd?: number;
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

/**
 * Profile-global Loop Library store (see specs/08-loop-library.md). Reads and
 * writes the versioned definition store shared across all of the profile's
 * workspaces. Implemented against the global app-state dir; tests fake it.
 */
export interface LibraryStore {
  /** Absolute path of the profile-global library dir, so the renderer can watch its index.json. */
  dir(): Promise<string>;
  /** The watched entry list (empty index when nothing has been saved yet). */
  readIndex(): Promise<LibraryIndex>;
  readEntry(entryId: string): Promise<LibraryEntry | null>;
  readVersion(entryId: string, version: number): Promise<LibraryVersion | null>;
  /** Persists a version file and updates entry.json + the index (serialized). */
  putVersion(entry: LibraryEntry, version: LibraryVersion): Promise<void>;
  /** Removes an entry and all its versions; never touches loaded loops. */
  deleteEntry(entryId: string): Promise<void>;
  /** Subscribe the renderer to the library index (push-based update detection). */
  watchIndex(): Promise<void>;
  unwatchIndex(): Promise<void>;
}

/**
 * Git-repo-backed Loop Catalog store (see specs/14-loop-catalog.md). Clones
 * live under the profile-global catalog dir; fetches happen only on demand
 * (no timers, no polling). Implemented in catalog-store.ts; tests fake it.
 */
export interface CatalogStore {
  /** The official ref first, then user-added repos. */
  listRepos(): Promise<CatalogRepoRef[]>;
  /** Registers a repo (no fetch yet — that happens on demand). */
  addRepo(url: string): Promise<CatalogRepoRef>;
  /** Drops the repo and its cache; never touches installed loops. */
  removeRepo(key: string): Promise<void>;
  /** Shallow clone on first call, `git pull` after. Fail-soft to the stale cache. */
  refresh(key: string): Promise<CatalogRefreshResult>;
  /** Reads the local cache (never fetches), fail-soft per entry. */
  readContents(key: string): Promise<CatalogRepoContents>;
  readEntry(key: string, slug: string): Promise<CatalogEntry | null>;
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
  /**
   * Lists the models available on this machine, grouped by provider. Used to
   * resolve a step's chosen model before a run and to detect a pinned model that
   * is no longer installed (falls back to the MED tier with a warning).
   */
  listAvailableModels(): Promise<SharedAvailableModelGroup[]>;
  /**
   * The real tool surface a background subagent loads in this workspace, so the
   * planner can pick each step's tools from the actual catalog (not a hardcoded
   * list). Published once at startup and refreshed from real runs.
   */
  listToolCatalog(): Promise<ContextToolInfo[]>;
  /**
   * The named agent roles available in this workspace, so the planner and the
   * per-step agent picker choose from the real catalog. Background steps may run
   * as one of these (spec 11).
   */
  listAgentCatalog(): Promise<ContextAgentInfo[]>;

  // ── Artifacts (large outputs under the state dir) ─────────
  /** Persists artifact content (relativePath resolved under the state dir) and returns a stable reference. */
  writeArtifact(relativePath: string, content: string): Promise<string>;
  /** Reads artifact content by the write ref OR a path relative to the state dir (null when absent). */
  readArtifact(ref: string): Promise<string | null>;

  // ── Workspace isolation (user-selected placement) ─────────
  /**
   * Creates or reuses one managed worktree for a loop. With `existingBranch`
   * the worktree checks out that branch (fetched from origin when only
   * remote) instead of minting a new one — PR-lifecycle work lands on the
   * PR's own branch, and removal never deletes it.
   */
  createWorktree(loopId: string, title: string, options?: { existingBranch?: string }): Promise<WorktreeHandle>;
  removeWorktree(loopId: string, options?: { deleteBranch?: boolean; force?: boolean }): Promise<void>;
  /** Workspace-root dirty preflight (workspace-root mode only). */
  getWorkspaceStatus(): Promise<WorkspaceStatus>;
  /** Stashes current workspace changes after an explicit user choice. */
  stashWorkspaceChanges(message: string): Promise<{ stashRef: string | null }>;
  /**
   * Open pull requests in this workspace's repo. Repo-scoped (works before any
   * worktree exists); per-loop attribution is done by the caller via branch-name
   * match. Fail-soft to `[]` when `gh`/the remote/PRs are absent.
   */
  listPullRequests(): Promise<AppRuntimePullRequestSummary[]>;
  /**
   * Runs a shell command at the workspace root. Management-plane observation
   * only — the GitHub event source's `gh api` polls (spec 12) — never workflow
   * work; the same carve-out as the dirty preflight and `listPullRequests`.
   */
  runCommand(command: string, timeoutMs?: number): Promise<AppRuntimeCommandResult>;

  // ── Notifications ─────────────────────────────────────────
  notify(message: string, type?: 'info' | 'warning' | 'error'): void;
  /** Visible choice notification with timeout fallback. */
  requestChoice(request: ChoiceRequest): Promise<ChoiceResult>;

  // ── Active-session control ────────────────────────────────
  session: SessionHost;

  // ── Loop Library (profile-global versioned definition store) ──
  library: LibraryStore;

  // ── Loop Catalog (git-repo-backed curated definitions) ────
  catalog: CatalogStore;

  // ── Deterministic utilities ───────────────────────────────
  /** ISO timestamp. Injectable so tests are deterministic. */
  now(): string;
  /** Unique id with an optional prefix. Injectable for deterministic tests. */
  newId(prefix?: string): string;
  /** Diagnostic logging. */
  log(message: string): void;
}
