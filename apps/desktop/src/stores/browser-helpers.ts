/**
 * Helpers used by the browser store. Pulled out to keep
 * `stores/browser.ts` under the 500-LOC rule.
 */

import { useAgentStore } from '@/stores/agent';
import { useAppStore } from '@/stores/app';
import { useSessionStore } from '@/stores/sessions';

/**
 * Format a page selection as a markdown blockquote with an attribution
 * line. Two trailing newlines leave the cursor on a fresh line so the user
 * can start typing their question immediately.
 */
export function formatSelectionForChat(
  selection: string,
  pageUrl: string,
  pageTitle: string,
): string {
  const trimmed = selection.replace(/\s+$/, '');
  const quoted = trimmed.split('\n').map((line) => `> ${line}`).join('\n');
  const title = pageTitle.trim();
  const attribution = title ? `— ${title} — ${pageUrl}` : `— ${pageUrl}`;
  return `${quoted}\n\n${attribution}\n\n`;
}

/**
 * "Please save this to memory" template that nudges the agent to call
 * the memory tool.
 */
export function formatSelectionForMemory(
  selection: string,
  pageUrl: string,
  pageTitle: string,
): string {
  const trimmed = selection.replace(/\s+$/, '');
  const quoted = trimmed.split('\n').map((line) => `> ${line}`).join('\n');
  const title = pageTitle.trim();
  const attribution = title ? `— ${title} — ${pageUrl}` : `— ${pageUrl}`;
  return `Please save this to memory:\n\n${quoted}\n\n${attribution}\n\n`;
}

function resolveActiveSessionId(): string | null {
  return (
    useAgentStore.getState().focusedSessionId ??
    useSessionStore.getState().activeSessionId ??
    null
  );
}

/** Drop formatted text into the focused (or active) chat session's composer. */
export function prefillChatComposer(text: string): void {
  const sessionId = resolveActiveSessionId();
  if (!sessionId) {
    console.warn('[browser] No chat session available — selection ignored.');
    return;
  }
  useAgentStore.getState().setComposerPrefill(sessionId, {
    requestId: `sel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    text,
    source: 'system',
  });
  if (!useAppStore.getState().chatPanelOpen) {
    useAppStore.getState().setChatPanelOpen(true);
  }
}
