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

import type { OrchestratorState } from '../shared/types';

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

  // ── Deterministic utilities ───────────────────────────────
  /** ISO timestamp. Injectable so tests are deterministic. */
  now(): string;
  /** Unique id with an optional prefix. Injectable for deterministic tests. */
  newId(prefix?: string): string;
  /** Diagnostic logging. */
  log(message: string): void;
}
