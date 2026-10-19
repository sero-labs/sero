/**
 * Runs one probe step inside a `codemode` script, and turns the script's
 * result back into the step's own result, so a step's `expect` works the same
 * at a Code Mode site as anywhere else.
 */
import type { ToolCallResult } from './types';

/** The name a script calls a tool by: characters a JavaScript identifier cannot hold become `_`. */
export function codemodeIdentifier(name: string): string {
  return name.replace(/[^A-Za-z0-9_$]/g, '_');
}

/** A script that makes one call and prints what it resolved to, images included. */
export function callScript(tool: string, args: Record<string, unknown>): string {
  return [
    `const result = await tools.${codemodeIdentifier(tool)}(${JSON.stringify(args)});`,
    "if (typeof result === 'string') return result;",
    "if (result && typeof result.output === 'string') return result.output;",
    'if (result && Array.isArray(result.content)) {',
    "  for (const item of result.content) item.type === 'image' ? image(item) : text(item.text ?? item);",
    '  return;',
    '}',
    'return result;',
  ].join('\n');
}

/** Printed by the line after a call that must fail. Seeing it means the script went on. */
export const AFTER_FAILED_CALL = 'tc: the line after the failing call ran';

/** A script whose one call must reject, followed by a line that must not run. */
export function rejectionScript(tool: string, args: Record<string, unknown>): string {
  return [
    `await tools.${codemodeIdentifier(tool)}(${JSON.stringify(args)});`,
    `text(${JSON.stringify(AFTER_FAILED_CALL)});`,
  ].join('\n');
}

const HEADER = /^Script (completed|failed)\nWall time [\d.]+ seconds\nOutput:\n\n?/;
const SCRIPT_ERROR = /\n?Script error:\n([\s\S]*)$/;

/** The step's result from the script's: a failed script is the call's failure, with its error text. */
export function unwrapScriptResult(result: ToolCallResult): ToolCallResult {
  const header = HEADER.exec(result.text);
  if (!header) throw new Error(`not a codemode result: ${result.text.slice(0, 300)}`);
  const body = result.text.slice(header[0].length);
  if (header[1] === 'completed') return { ...result, isError: false, text: body };
  return { ...result, isError: true, text: SCRIPT_ERROR.exec(body)?.[1] ?? body };
}
