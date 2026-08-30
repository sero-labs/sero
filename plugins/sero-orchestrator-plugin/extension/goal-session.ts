/**
 * Shared plumbing for the in-session goal surfaces.
 *
 * Every goal surface answers the same two questions first: which Goal runtime
 * owns this workspace, and which Pi session file is calling. Both live here so
 * the loop, the terminal tools and the `/goal` command cannot disagree.
 */

import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { GoalOutcome } from '../shared/goal-types';
import type { GoalRuntime } from '../runtime/goals/goal-runtime';
import { resolveGoalRuntimeByCwd } from '../runtime/registry';

export interface ToolResult {
  text: string;
  content: { type: 'text'; text: string }[];
  details: Record<string, unknown>;
}

export function toolResult(outcome: GoalOutcome): ToolResult {
  const text = outcome.ok ? outcome.text : `Error: ${outcome.text}`;
  return {
    text,
    content: [{ type: 'text', text }],
    details: {
      ok: outcome.ok,
      goal: outcome.goal,
      ...(outcome.ok ? {} : { error: outcome.text }),
    },
  };
}

export function toolFailure(message: string): ToolResult {
  return toolResult({ ok: false, text: message });
}

/**
 * The session file this call runs in. It is the goal's identity: the host
 * created the file for one conversation, and a session cannot report another
 * session's path, so a terminal call from elsewhere is refused.
 */
export function sessionPathOf(ctx: ExtensionContext | undefined): string | null {
  return ctx?.sessionManager.getSessionFile?.() ?? null;
}

export interface GoalCaller {
  runtime: GoalRuntime;
  sessionPath: string;
}

/** Resolves the runtime and the calling session, or the reason it could not. */
export function resolveGoalCaller(
  ctx: ExtensionContext | undefined,
  resolve: (cwd: string) => GoalRuntime | undefined = resolveGoalRuntimeByCwd,
): GoalCaller | { error: string } {
  const cwd = ctx?.cwd;
  if (!cwd) return { error: 'No workspace context is available for this call.' };
  const runtime = resolve(cwd);
  if (!runtime) {
    return {
      error: 'Goal mode needs the Orchestrator runtime. Open this workspace in Sero and try again.',
    };
  }
  const sessionPath = sessionPathOf(ctx);
  if (!sessionPath) return { error: 'This session has no session file, so it cannot hold a goal.' };
  return { runtime, sessionPath };
}
