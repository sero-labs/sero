/**
 * Editor bridge — lightweight event bus for "open file in editor" requests.
 *
 * Used by the ChatPanel / ToolCallGroup to request that the CodingWorkspace
 * opens a specific file tab.  CodingWorkspace subscribes and handles the event.
 */

import { create } from 'zustand';

interface EditorBridgeState {
  /** Pending file-open request. Consumed by CodingWorkspace on the next tick. */
  pendingOpen: { workspaceId: string; filePath: string } | null;

  /** Request the editor to open a file. */
  requestOpenFile: (workspaceId: string, filePath: string) => void;

  /** Consume (and clear) the pending request. Returns it, or null. */
  consumeOpenRequest: () => { workspaceId: string; filePath: string } | null;
}

export const useEditorBridge = create<EditorBridgeState>((set, get) => ({
  pendingOpen: null,

  requestOpenFile: (workspaceId, filePath) =>
    set({ pendingOpen: { workspaceId, filePath } }),

  consumeOpenRequest: () => {
    const pending = get().pendingOpen;
    if (pending) set({ pendingOpen: null });
    return pending;
  },
}));
