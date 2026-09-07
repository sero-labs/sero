/**
 * Coordinator action contracts. Split from types.ts to keep each file within the
 * 500-LOC limit; re-exported from types.ts so existing imports are unaffected.
 */

import type { ContextOverrides, OrchestratorBoardAction } from '@sero-ai/common';
import type { CatalogRepoContents, CatalogRepoRef } from './catalog-types';
import type { OrchestratorEvent } from './event-types';
import type {
  InputAnswer,
  LibraryIndex,
  Loop,
  LoopDeliverySettings,
  LoopLimits,
  LoopRun,
  LoopTriggerSuggestion,
  LoopWorkspaceSettings,
  RecoveryDecision,
} from './types';

export interface CreateLoopOptions {
  activate?: boolean;
  triggers?: LoopTriggerSuggestion[];
  limits?: Partial<LoopLimits>;
  workspace?: Partial<LoopWorkspaceSettings>;
  delivery?: LoopDeliverySettings;
}

export type OrchestratorAction =
  | { kind: 'create'; prompt: string; title?: string; options?: CreateLoopOptions }
  | { kind: 'activate'; loopId: string }
  | { kind: 'list' }
  | { kind: 'show'; loopId: string }
  | { kind: 'disable'; loopId: string }
  | { kind: 'enable'; loopId: string }
  | { kind: 'run_next'; loopId: string }
  | { kind: 'run_again'; loopId: string }
  | { kind: 'retry'; loopId: string }
  | { kind: 'retry_step'; loopId: string; stepId: string }
  | { kind: 'revise'; loopId: string; prompt?: string }
  | { kind: 'choose_recovery'; loopId: string; decision: RecoveryDecision }
  | { kind: 'set_step_model'; loopId: string; stepId: string; model?: string; thinking?: string }
  | { kind: 'set_step_tools'; loopId: string; stepId: string; tools?: string[] }
  | { kind: 'set_step_agent'; loopId: string; stepId: string; agent?: string }
  | { kind: 'set_loop_context'; loopId: string; overrides: ContextOverrides | null }
  | { kind: 'set_delivery'; loopId: string; delivery: LoopDeliverySettings }
  | { kind: 'set_schedule'; loopId: string; triggerId: string; schedule?: string; disabled?: boolean }
  | { kind: 'reflect'; loopId: string }
  | { kind: 'reflect_workspace' }
  | { kind: 'choose_suggestion'; loopId: string; suggestionId: string; decision: 'approve' | 'reject'; rejectionReason?: string }
  | { kind: 'extract_skill'; loopId: string }
  | {
      kind: 'save_skill';
      loopId: string;
      /** The pending draft being saved. A stale or absent id is refused. */
      draftId: string;
      name: string;
      description: string;
      body: string;
      overwrite?: boolean;
    }
  | { kind: 'discard_skill_draft'; loopId: string }
  | { kind: 'answer_input'; loopId: string; requestId: string; answers: InputAnswer[] }
  | { kind: 'library_save'; loopId: string; mode: 'new-version' | 'new-entry'; name?: string; note?: string }
  | { kind: 'library_load'; entryId: string; version?: number }
  | { kind: 'library_list' }
  | { kind: 'library_set_version'; loopId: string; version: number }
  | { kind: 'library_unlink'; loopId: string }
  | { kind: 'library_delete'; entryId: string }
  | { kind: 'catalog_list' }
  | { kind: 'catalog_add_repo'; url: string }
  | { kind: 'catalog_remove_repo'; repoKey: string }
  | { kind: 'catalog_refresh'; repoKey?: string }
  | { kind: 'catalog_install'; repoKey: string; slug: string; workspaceLoad?: boolean }
  | { kind: 'delete'; loopId: string; deleteBranch?: boolean }
  | { kind: 'fire_event'; event: OrchestratorEvent };

/**
 * Compile-time guard: every action the shell's Agent Board can send
 * (@sero-ai/common orchestrator-contract) must be a valid coordinator action.
 * A drifted board payload fails typecheck here, next to the union it mirrors.
 */
type Assert<T extends true> = T;
export type BoardActionContractCheck = Assert<
  OrchestratorBoardAction extends OrchestratorAction ? true : false
>;

/** Per-loop result of a workspace-wide reflection sweep. */
export interface ReflectedLoopSummary {
  loopId: string;
  title: string;
  suggestionCount: number;
}

export interface OrchestratorActionResult {
  ok: boolean;
  loop?: Loop;
  /** Set by `create`: the new loop's id, for callers that hold only the typed board handle. */
  loopId?: string;
  loops?: Loop[];
  run?: LoopRun;
  error?: string;
  /** Set by `fire_event`: how many active loops accepted the event. */
  delivered?: number;
  /** Set by `fire_event`: the event's dedupeKey was already delivered, so it was dropped. */
  deduped?: boolean;
  /** Set by `reflect`: how many suggestions this pass produced. */
  reflection?: { suggestionCount: number };
  /** Set by `reflect_workspace`: the consecutive per-loop sweep summary. */
  workspaceReflection?: { reflected: number; suggestionCount: number; perLoop: ReflectedLoopSummary[] };
  /**
   * Set by `extract_skill`: the pass ran and judged the workflow teaches nothing
   * durable. A successful outcome, not an error (see specs/18-skill-extraction.md).
   */
  skillDeclined?: string;
  /** Set by `extract_skill` / `save_skill`: the drafted SKILL.md body, so the UI can show and edit it. */
  skillDraftBody?: string;
  /** Set by `save_skill` when the name is taken and the user has not chosen to overwrite. */
  skillConflict?: { name: string; filePath: string };
  /** Set by `library_list`: the resolved profile-global library dir (so the UI can watch its index.json). */
  libraryDir?: string;
  /** Set by `library_list`: a snapshot of the library index (the live data comes from watching the dir). */
  libraryIndex?: LibraryIndex;
  /** Set by the `catalog_*` reads: configured repos (official first). */
  catalogRepos?: CatalogRepoRef[];
  /** Set by `catalog_list`/`catalog_refresh`: each repo's cached contents (fail-soft per entry). */
  catalogContents?: CatalogRepoContents[];
  /** Set by `catalog_refresh`: per-repo fetch outcomes (stale ⇒ showing the last-fetched cache). */
  catalogRefresh?: { key: string; stale: boolean; reason?: string }[];
  /** Set by `catalog_refresh`: newer catalog versions appended as library versions (or skipped with a reason). */
  catalogUpdates?: { repoKey: string; slug: string; entryId: string; libraryVersion?: number; skipped?: string }[];
}
