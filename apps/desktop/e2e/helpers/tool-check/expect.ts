import type { ToolCallResult } from './types';

/** `sero-cli` starts the text of a failed command with this. */
const CLI_FAILURE = /^ERROR: /;

function failed(result: ToolCallResult): boolean {
  return result.isError ?? CLI_FAILURE.test(result.text);
}

/** Fails unless the call succeeded. */
export function expectOk(result: ToolCallResult): void {
  if (failed(result)) throw new Error(`expected success, got an error: ${result.text}`);
}

/** Fails unless the call failed and its text contains `fragment`. */
export function expectError(result: ToolCallResult, fragment: string): void {
  if (!failed(result)) throw new Error(`expected an error, got success: ${result.text}`);
  if (!result.text.includes(fragment)) throw new Error(`error does not mention ${JSON.stringify(fragment)}: ${result.text}`);
}

/** Fails unless the call succeeded and its text contains `fragment`. */
export function expectText(result: ToolCallResult, fragment: string): void {
  expectOk(result);
  if (!result.text.includes(fragment)) throw new Error(`result does not mention ${JSON.stringify(fragment)}: ${result.text}`);
}
