import type {
  AfterToolCallContext,
  AfterToolCallResult,
  Agent,
} from '@earendil-works/pi-agent-core';

/**
 * Report a failed command as a failed tool call, for `bash` and for `sero-cli`.
 *
 * `sero-cli` returns a failed command as text with a non-zero `exitCode`, and
 * the agent loop would report that as a success. A Code Mode script only stops
 * on a call the loop reports as failed, so without this a script runs every
 * later line against a state its failed command never produced.
 *
 * For `bash` this also preserves the status across extension result hooks.
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
    const failed = isFailedCommandResult(context.toolCall.name, context.result);
    const override = callAfterHooks ? await callAfterHooks(context, signal) : undefined;
    if (!failed) return override;
    return { ...(override ?? {}), isError: true };
  };
}

/** Read the original result, before any extension result hook can replace it. */
function isFailedCommandResult(toolName: string, result: unknown): boolean {
  if (toolName !== 'bash' && toolName !== 'sero-cli') return false;
  const details = (result as { details?: unknown } | null | undefined)?.details;
  if (typeof details !== 'object' || details === null) return false;
  const exitCode = (details as { exitCode?: unknown }).exitCode;
  return typeof exitCode === 'number' && exitCode !== 0;
}
