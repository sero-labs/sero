/**
 * Code Mode gives every call a script makes the id `<parent call id>/<n>`, and
 * appends another `/<n>` for a call made by such a call. Both hooks use this
 * guard, so a nested call is left unmodified.
 */
const NESTED_CALL_ID_PATTERN = /\/\d+$/;

/** Whether a tool call id is a call a tool made while it ran, rather than one the model issued. */
export function isNestedCall(toolCallId: string): boolean {
  return NESTED_CALL_ID_PATTERN.test(toolCallId);
}
