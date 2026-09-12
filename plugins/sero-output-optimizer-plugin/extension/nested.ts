/**
 * The reserved call-id prefix the host guarantees for shell calls issued inside
 * `run_code`. Both hooks use this guard, so a nested call is left unmodified.
 */
export const NESTED_CALL_PREFIX = 'run_code_';

export function isNestedCall(toolCallId: string): boolean {
  return toolCallId.startsWith(NESTED_CALL_PREFIX);
}
