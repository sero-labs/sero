import type {
  AfterToolCallContext,
  AfterToolCallResult,
  Agent,
} from '@earendil-works/pi-agent-core';

/**
 * Preserve the failure status of a bash call across extension result hooks.
 *
 * The agent loop takes `isError` from the value the `tool_result` hooks return.
 * A valid hook may replace `details`, which removes the `exitCode` that a later
 * hook would read, and the loop then reports the failed command as a success.
 * The original result is only available before the hooks run, so this derives
 * the status from it and re-applies the status after the chain.
 *
 * The exit code is the source of truth: a hook cannot turn a non-zero exit into
 * a success by dropping or replacing `details`. A hook can still mark a
 * zero-exit call as an error.
 */
export function preserveBashFailureStatus(agent: Pick<Agent, 'afterToolCall'>): void {
  const callAfterHooks = agent.afterToolCall;

  agent.afterToolCall = async (
    context: AfterToolCallContext,
    signal?: AbortSignal,
  ): Promise<AfterToolCallResult | undefined> => {
    const failed = isFailedBashResult(context.toolCall.name, context.result);
    const override = callAfterHooks ? await callAfterHooks(context, signal) : undefined;
    if (!failed) return override;
    return { ...(override ?? {}), isError: true };
  };
}

/** Read the original result, before any extension result hook can replace it. */
function isFailedBashResult(toolName: string, result: unknown): boolean {
  if (toolName !== 'bash') return false;
  const details = (result as { details?: unknown } | null | undefined)?.details;
  if (typeof details !== 'object' || details === null) return false;
  const exitCode = (details as { exitCode?: unknown }).exitCode;
  return typeof exitCode === 'number' && exitCode !== 0;
}
