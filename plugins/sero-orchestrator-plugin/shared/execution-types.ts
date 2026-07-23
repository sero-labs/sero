/**
 * Step execution targets. Split from types.ts (500-LOC limit) and re-exported
 * there so existing imports keep resolving.
 */

export type StepExecutionTarget =
  | BackgroundAgentTarget
  | ActiveSessionTarget
  | ModelTarget;

export interface BackgroundAgentTarget {
  type: 'background-agent';
  model?: string;
  thinking?: string;
  /**
   * Named agent role to run this step as (one of the workspace's `.md` agents),
   * picked by the planner and user-overridable. Omitted ⇒ the default ad-hoc
   * agent. A role contributes its system prompt and its default model/thinking;
   * the orchestrator's step contract always still applies. An unknown role at run
   * time falls back to the default with a warning (see spec 11).
   */
  agent?: string;
  /**
   * EXTRA tools this step needs beyond the always-on default tools
   * (DEFAULT_TOOLS), picked by the planner and user-overridable. The effective
   * allowlist is defaults ∪ tools; the default tools can't be removed.
   * Omitted/empty means defaults only. Restricting the active surface also
   * trims the per-tool prompt guidance.
   */
  tools?: string[];
}

export interface ActiveSessionTarget {
  type: 'active-session';
  sessionTarget: SessionTarget;
}

export interface ModelTarget {
  type: 'model';
  model?: string;
  thinking?: string;
  outputSchema?: unknown;
}

export interface SessionTarget {
  workspaceId: string;
  sessionId?: string;
  strategy: 'specific-session' | 'most-recent-active' | 'ask-user';
  deliverAs: 'steer' | 'followUp' | 'nextTurn';
  triggerTurn: boolean;
}
