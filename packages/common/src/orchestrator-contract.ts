/**
 * Cross-plugin contract for the Orchestrator's scheduled loops.
 *
 * The Orchestrator app (workspace-scoped) maintains a small watched loop index;
 * other surfaces — currently the Scheduler (cron) app — read that index to list
 * scheduled loops, deep-link back into the Orchestrator, and edit a loop's
 * schedule through the `orchestrator` tool. Keeping the shared shapes here makes
 * producer/consumer drift a typecheck error instead of a runtime mismatch.
 */

export const ORCHESTRATOR_APP_ID = 'orchestrator';

/** The Orchestrator's watched loop index, relative to the workspace root. */
export const ORCHESTRATOR_INDEX_FILE = '.sero/apps/orchestrator/index.json';

export type OrchestratorLoopStatus = 'draft' | 'active' | 'blocked' | 'complete' | 'disabled';

/** Compact view of one scheduled (cron/hybrid) trigger, embedded in the loop index. */
export interface OrchestratorScheduleSummary {
  triggerId: string;
  /** 'cron' fires purely on schedule; 'hybrid' also fires on events. */
  type: 'cron' | 'hybrid';
  /** 5-field cron expression (minute hour dom month dow), evaluated in UTC. */
  schedule: string;
  /** ISO timestamp of the next scheduled fire (absent when paused or exhausted). */
  nextFireAt?: string;
  lastFireAt?: string;
  /**
   * True when the user paused the cron schedule (resumable). A hybrid trigger
   * still fires on its events while paused — only the schedule is stopped.
   */
  paused?: boolean;
  /**
   * True when the trigger hit its declared run limit (maxFires) — it will not
   * fire again and can't be resumed; the loop must be restarted in Orchestrator.
   */
  exhausted?: boolean;
}

/** The subset of a loop-index entry that external surfaces rely on. */
export interface OrchestratorScheduledLoopView {
  id: string;
  title: string;
  status: OrchestratorLoopStatus;
  /** Present only when the loop has cron/hybrid triggers carrying a schedule. */
  schedules?: OrchestratorScheduleSummary[];
  /** A user-delayed run will retry at this durable timestamp. */
  snoozedUntil?: string;
  updatedAt: string;
}

/** The watched index file shape (the externally consumed subset). */
export interface OrchestratorIndexView {
  loops: OrchestratorScheduledLoopView[];
}

/** Flat params for the `orchestrator` tool's `set_schedule` action (cross-app schedule edits). */
export interface OrchestratorSetScheduleParams {
  action: 'set_schedule';
  loopId: string;
  triggerId: string;
  /** New 5-field cron expression (UTC). Omit to keep the current one. */
  schedule?: string;
  /** Pause (true) or resume (false) the schedule. Omit to keep the current state. */
  scheduleDisabled?: boolean;
}

// ── Agent Board view (cross-workspace board, docs/features/agent-board/plan.md) ──
//
// The board reads every workspace's watched index and renders loop cards without
// importing plugin internals. `LoopSummary` in the Orchestrator plugin extends
// `OrchestratorBoardLoopView`, so a summary field the board relies on drifting
// becomes a typecheck error in the plugin, not a runtime mismatch here.

/** One choice of a multiple-choice question (mirrors the plugin's HumanChoice). */
export interface OrchestratorQuestionChoiceView {
  id: string;
  label: string;
}

/** A pending question, enough to answer it inline from the board. */
export interface OrchestratorQuestionView {
  id: string;
  prompt: string;
  /** Approval gates render approve/reject instead of free-form input. */
  kind?: 'approval';
  /** Exact content the gate is approving (e.g. the message about to be sent). */
  attachment?: string;
  choices?: OrchestratorQuestionChoiceView[];
}

/** A loop's pending input request — `requestId` feeds the `answer_input` action. */
export interface OrchestratorAttentionInputView {
  requestId: string;
  source: 'planner' | 'step';
  questions: OrchestratorQuestionView[];
}

/** One pending reflection suggestion — `id` feeds the `choose_suggestion` action. */
export interface OrchestratorAttentionSuggestionView {
  id: string;
  rationale: string;
  confidence: 'low' | 'medium' | 'high';
  changedStepCount: number;
}

/** The "needs you" content of one loop. Present only while the loop waits on the user. */
export interface OrchestratorAttentionView {
  input?: OrchestratorAttentionInputView;
  suggestions?: OrchestratorAttentionSuggestionView[];
}

/** Step progress of the active plan. */
export interface OrchestratorProgressView {
  total: number;
  done: number;
  running: boolean;
}

/** Rolled-up token/cost/time totals. Fields present only when reported. */
export interface OrchestratorUsageView {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  durationMs?: number;
}

/** An open PR a loop has raised (compact chip data). */
export interface OrchestratorPullRequestView {
  number: number;
  url: string;
  title: string;
}

/**
 * The per-loop slice of the watched index the Agent Board renders. Everything is
 * derived from durable loop state by the plugin's index writer — the board adds
 * no polling and no heuristics on top.
 */
export interface OrchestratorBoardLoopView extends OrchestratorScheduledLoopView {
  summary?: string;
  /** Count badges (the compact form of `attention`). */
  pendingInput?: number;
  pendingSuggestions?: number;
  progress?: OrchestratorProgressView;
  attention?: OrchestratorAttentionView;
  /** Lifetime usage roll-up across all runs. */
  usage?: OrchestratorUsageView;
  /** Titles of the steps currently running — the card's live activity line. */
  activeStepTitles?: string[];
  /** Model of the most recent step attempt that reported one. */
  lastModel?: string;
  /** Branch of the loop's resolved workspace (worktree or workspace root). */
  branchName?: string;
  /** Absolute path of the loop's checkout (worktree or workspace root) — feeds the diff stat. */
  checkoutPath?: string;
  /** Open PRs attributed to this loop. */
  pullRequests?: OrchestratorPullRequestView[];
  lastRunAt?: string;
  createdAt?: string;
}

/** The watched index as the board consumes it. */
export interface OrchestratorBoardIndexView {
  loops: OrchestratorBoardLoopView[];
}

// ── Board actions (shell → per-workspace coordinator) ──
//
// The subset of coordinator actions the board routes inline. Kinds and payloads
// mirror the plugin's `OrchestratorAction` union — the plugin asserts the
// subset relation at compile time, so a drifted payload fails typecheck there.

/** One answer to a pending question (mirrors the plugin's InputAnswer). */
export interface OrchestratorInputAnswerView {
  questionId: string;
  choiceId?: string;
  text?: string;
}

/** An event fired at a workspace's loops (Start work on an issue, etc.). */
export interface OrchestratorBoardEventView {
  id: string;
  /** Namespaced source id, e.g. "github:issue-opened". */
  source: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  summary?: string;
  dedupeKey?: string;
}

export type OrchestratorBoardAction =
  | { kind: 'activate'; loopId: string }
  | { kind: 'run_next'; loopId: string }
  | { kind: 'run_again'; loopId: string }
  | { kind: 'retry'; loopId: string }
  | { kind: 'retry_step'; loopId: string; stepId: string }
  | { kind: 'answer_input'; loopId: string; requestId: string; answers: OrchestratorInputAnswerView[] }
  | {
      kind: 'choose_suggestion';
      loopId: string;
      suggestionId: string;
      decision: 'approve' | 'reject';
      rejectionReason?: string;
    }
  | { kind: 'fire_event'; event: OrchestratorBoardEventView };

/** The slice of the coordinator's action result the board consumes. */
export interface OrchestratorBoardActionResult {
  ok: boolean;
  error?: string;
  /** Set by `fire_event`: how many loops accepted the event (0 ⇒ nothing subscribed). */
  delivered?: number;
  /** Set by `fire_event`: the event's dedupeKey was already delivered, so it was dropped. */
  deduped?: boolean;
}

// ── Coordinator registry seam (Electron main) ──
//
// Coordinators register on `globalThis` because the plugin's runtime and
// extension bundles load through different loaders in the same main process
// (see the plugin's runtime/registry.ts). The shell's `sero:orchestrator:action`
// handler reaches a coordinator through this same global — typed here so the
// shell never imports plugin internals.

export const ORCHESTRATOR_REGISTRY_GLOBAL_KEY = '__seroOrchestratorCoordinators__';

/** The narrow coordinator surface the shell invokes. */
export interface OrchestratorCoordinatorHandle {
  requestAction(action: OrchestratorBoardAction): Promise<OrchestratorBoardActionResult>;
}

export interface OrchestratorRegistryEntryView {
  workspaceId: string;
  workspacePath: string;
  coordinator: OrchestratorCoordinatorHandle;
}

/** Reads the shared coordinator registry off `globalThis` (Electron main only). */
export function getOrchestratorRegistry(): ReadonlyMap<string, OrchestratorRegistryEntryView> | undefined {
  const globalScope = globalThis as Record<string, unknown>;
  return globalScope[ORCHESTRATOR_REGISTRY_GLOBAL_KEY] as
    | Map<string, OrchestratorRegistryEntryView>
    | undefined;
}
