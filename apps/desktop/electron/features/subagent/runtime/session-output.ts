/**
 * Reading a session's own output.
 *
 * Split from the runner to keep each file within the 500-LOC limit.
 */

import type { AgentMessage } from '@earendil-works/pi-agent-core';

export function extractToolArgsSummary(_toolName: string, args?: Record<string, unknown>): string {
  if (!args) return '';
  // Return the full value, the tracker caps its length (MAX_TOOL_ARGS_CHARS) and
  // the UI truncates it to fit, showing the full command on hover.
  if (typeof args.command === 'string') return args.command;
  if (typeof args.path === 'string') return args.path;
  if (typeof args.file_path === 'string') return args.file_path;
  if (typeof args.query === 'string') return args.query;
  if (typeof args.pattern === 'string') return args.pattern;
  // Fallback: first string value
  const first = Object.values(args).find((v) => typeof v === 'string');
  return typeof first === 'string' ? first : '';
}

/**
 * Extract the full text response from a session's messages.
 */
export function extractResponse(messages: AgentMessage[]): string {
  const assistantMessages = messages.filter(
    (m): m is Extract<AgentMessage, { role: 'assistant' }> =>
      'role' in m && m.role === 'assistant',
  );
  if (assistantMessages.length === 0) return '';

  // Get the last assistant message's text content
  const lastMsg = assistantMessages[assistantMessages.length - 1];
  return lastMsg.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text' && 'text' in c)
    .map((c) => c.text)
    .join('');
}
