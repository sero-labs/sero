/**
 * Editor bridge — lightweight event bus for "open file in editor" requests.
 *
 * Used by the ChatPanel / ToolCallGroup to request that the ExplorerWorkspace
 * opens a specific file tab.  ExplorerWorkspace subscribes and handles the event.
 */

import { create } from 'zustand';
import { useAppStore } from '@/stores/app';
import { useExplorerStore } from '@/stores/explorer';
import { useWorkspaceStore } from '@/stores/workspace';

interface EditorBridgeState {
  /** Pending file-open request. Consumed by ExplorerWorkspace on the next tick. */
  pendingOpen: { workspaceId: string; filePath: string } | null;

  /** Request the editor to open a file. */
  requestOpenFile: (workspaceId: string, filePath: string) => void;

  /** Consume (and clear) the pending request. Returns it, or null. */
  consumeOpenRequest: () => { workspaceId: string; filePath: string } | null;
}

function focusEditor(workspaceId: string): void {
  useWorkspaceStore.getState().setActiveWorkspace(workspaceId);
  useExplorerStore.getState().set(workspaceId, {
    activePanel: 'explorer',
    sidebarOpen: true,
  });
  useAppStore.getState().setActiveApp('explorer');
}

export const useEditorBridge = create<EditorBridgeState>((set, get) => ({
  pendingOpen: null,

  requestOpenFile: (workspaceId, filePath) => {
    focusEditor(workspaceId);
    set({ pendingOpen: { workspaceId, filePath } });
  },

  consumeOpenRequest: () => {
    const pending = get().pendingOpen;
    if (pending) set({ pendingOpen: null });
    return pending;
  },
}));
