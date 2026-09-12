/**
 * Result presentations for tool calls that reject.
 *
 * The bash tool rejects a non-zero exit so the Pi agent loop reports
 * `isError`, and that path replaces the tool's own `content` and `details`.
 * The tool therefore records the presentation here, and a `tool_result` hook
 * restores it. The rejected result then carries the same content blocks and
 * typed capture metadata as a successful one.
 *
 * The map is bounded and holds presentation data only; capture files live on
 * disk.
 */

export interface ToolResultTextBlock {
  type: 'text';
  text: string;
}

export interface ToolResultPresentation {
  content: ToolResultTextBlock[];
  details: Record<string, unknown>;
}

const MAX_RECORDS = 256;

const presentations = new Map<string, ToolResultPresentation>();

export function recordToolResult(toolCallId: string, presentation: ToolResultPresentation): void {
  presentations.delete(toolCallId);
  presentations.set(toolCallId, presentation);
  while (presentations.size > MAX_RECORDS) {
    const oldest = presentations.keys().next().value;
    if (oldest === undefined) break;
    presentations.delete(oldest);
  }
}

export function readToolResult(toolCallId: string): ToolResultPresentation | undefined {
  return presentations.get(toolCallId);
}

export function clearToolResultsForTests(): void {
  presentations.clear();
}
