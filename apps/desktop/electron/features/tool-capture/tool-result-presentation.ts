import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { readToolResult } from './tool-results';

/**
 * Restore the bash result presentation lost when the tool rejects.
 *
 * A non-zero exit rejects the tool so the agent loop reports `isError`, and that
 * path replaces `content` and `details`. The hook restores the recorded
 * presentation, so extension hooks and the desktop UI receive the capture
 * reference and the typed truncation state for a failed command too. It never
 * changes `isError`.
 */
export function registerToolResultPresentation(pi: ExtensionAPI): void {
  pi.on('tool_result', (event) => {
    if (event.toolName !== 'bash') return undefined;
    const presentation = readToolResult(event.toolCallId);
    if (!presentation) return undefined;
    return { content: presentation.content, details: presentation.details };
  });
}
