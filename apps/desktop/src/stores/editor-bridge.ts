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

function normalizeHostPath(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  if (/^([a-z]:)?\/$/i.test(normalized)) return normalized;
  return normalized.replace(/\/+$/g, '') || '/';
}

function isSameOrChild(rootPath: string, candidatePath: string): boolean {
  const root = normalizeHostPath(rootPath);
  const candidate = normalizeHostPath(candidatePath);
  const insensitive = /^[a-z]:\//i.test(root) || /^[a-z]:\//i.test(candidate);
  const left = insensitive ? candidate.toLowerCase() : candidate;
  const right = insensitive ? root.toLowerCase() : root;
  return left === right || left.startsWith(`${right}/`);
}

function toVirtualChildPath(prefix: string, rootPath: string, filePath: string): string {
  const root = normalizeHostPath(rootPath);
  const file = normalizeHostPath(filePath);
  const relative = file.slice(root.length).replace(/^\/+/, '');
  return relative ? `${prefix}/${relative}` : prefix;
}

function toEditorPath(workspaceId: string, filePath: string): string {
  const workspace = useWorkspaceStore.getState().workspaces.find((item) => item.id === workspaceId);
  if (!workspace) return filePath;

  for (const root of workspace.roots) {
    if (isSameOrChild(root.path, filePath)) {
      return toVirtualChildPath(`/${root.id}`, root.path, filePath);
    }
  }

  if (isSameOrChild(workspace.path, filePath)) {
    return toVirtualChildPath('/workspace', workspace.path, filePath);
  }

  return filePath;
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
    set({ pendingOpen: { workspaceId, filePath: toEditorPath(workspaceId, filePath) } });
  },

  consumeOpenRequest: () => {
    const pending = get().pendingOpen;
    if (pending) set({ pendingOpen: null });
    return pending;
  },
}));
