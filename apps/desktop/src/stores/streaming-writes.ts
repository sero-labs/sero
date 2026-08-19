/**
 * Live file content from an in-flight `write` tool call.
 *
 * The model streams a file as tool-call arguments, so the content exists in the
 * agent store before the tool has run and before anything reaches disk. An open
 * editor tab reads it here to show the file filling in; once the write lands,
 * the file watcher in `useEditorRuntimeSync` supplies the real content.
 */

import { useAgentStore } from '@/stores/agent';
import type { AgentState } from '@/stores/agent-types';
import { toEditorPath } from '@/stores/editor-bridge';

/**
 * Content being streamed to `editorPath` right now, or null.
 *
 * Only `write` qualifies: `edit` streams a single replacement fragment, which
 * is not the file and must never replace a document.
 */
export function selectStreamingWriteContent(
  state: AgentState,
  workspaceId: string,
  editorPath: string | null,
): string | null {
  if (!editorPath) return null;

  for (const agent of Object.values(state.agents)) {
    // Streaming arguments only exist mid-turn, so idle sessions cost nothing.
    if (!agent.isStreaming || agent.workspaceId !== workspaceId) continue;

    for (let index = agent.messages.length - 1; index >= 0; index -= 1) {
      const message = agent.messages[index];
      if (message.type !== 'tool' || message.toolName !== 'write') continue;
      // The overlay lasts until the tool completes, not until its arguments
      // finish: in between, the file has not been written yet, so dropping it
      // early would flash the pre-write content back onto the tab.
      if (message.state !== 'pending' && message.state !== 'running') continue;

      const { path, content } = message.input;
      if (typeof path !== 'string' || typeof content !== 'string') continue;
      if (toEditorPath(workspaceId, path) !== editorPath) continue;
      return content;
    }
  }

  return null;
}

export function useStreamingWriteContent(
  workspaceId: string,
  editorPath: string | null,
): string | null {
  return useAgentStore((state) => selectStreamingWriteContent(state, workspaceId, editorPath));
}
