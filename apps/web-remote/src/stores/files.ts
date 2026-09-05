/**
 * File browser store — file tree, open files, and preview state.
 *
 * Uses queues for pending requests to safely handle multiple concurrent
 * list_files / read_file requests (previous single-slot tracking was fragile).
 */

import { create } from 'zustand';
import { useConnectionStore } from './connection';
import { useWorkspaceStore } from './workspace';
import type { FileEntry, FileContent } from '@/lib/file-api';
import type { GatewayMessage } from '@/lib/gateway-client';

interface OpenFile {
  path: string;
  content: string;
  mimeType: string;
  encoding: 'utf8' | 'base64';
}

interface FileStore {
  tree: Record<string, FileEntry[]>;
  openFiles: OpenFile[];
  activeFilePath: string | null;
  expandedDirs: Set<string>;
  isLoading: boolean;

  fetchDirectory: (dirPath: string) => void;
  openFile: (filePath: string) => void;
  closeFile: (filePath: string) => void;
  setActiveFile: (filePath: string) => void;
  toggleDir: (dirPath: string) => void;
  refreshAfterUpload: (workspaceRelativePath: string) => void;
  applyChangedDirectories: (directories: string[]) => void;
  resetTree: () => void;
  handleMessage: (msg: GatewayMessage) => void;

  /** Queues for pending requests — supports concurrent in-flight requests. */
  _pendingListQueue: string[];
  _pendingReadQueue: string[];
}

/** The path the remote sends for the workspace root. */
export const ROOT_DIR_PATH = '/';

/**
 * The runtime's own name for the workspace root, read off a listed entry.
 *
 * The tree keys a folder by the path the runtime returned, such as
 * `/workspace/uploads`. An upload result is workspace-relative, such as
 * `uploads/notes.txt`. This is what joins the two vocabularies.
 */
function runtimeRootPrefix(rootEntries: FileEntry[]): string | null {
  const first = rootEntries[0];
  if (!first) return null;
  const slash = first.path.lastIndexOf('/');
  return slash < 0 ? null : first.path.slice(0, slash);
}

export const useFileStore = create<FileStore>((set, get) => ({
  tree: {},
  openFiles: [],
  activeFilePath: null,
  expandedDirs: new Set(),
  isLoading: false,
  _pendingListQueue: [],
  _pendingReadQueue: [],

  fetchDirectory: (dirPath: string) => {
    const { activeWorkspaceId } = useWorkspaceStore.getState();
    if (!activeWorkspaceId) return;

    set((s) => ({
      isLoading: true,
      _pendingListQueue: [...s._pendingListQueue, dirPath],
    }));
    useConnectionStore.getState().client.listFiles(activeWorkspaceId, dirPath);
  },

  openFile: (filePath: string) => {
    const { activeWorkspaceId } = useWorkspaceStore.getState();
    if (!activeWorkspaceId) return;

    // Check if already open
    const existing = get().openFiles.find((f) => f.path === filePath);
    if (existing) {
      set({ activeFilePath: filePath });
      return;
    }

    set((s) => ({
      _pendingReadQueue: [...s._pendingReadQueue, filePath],
    }));
    useConnectionStore.getState().client.readFile(activeWorkspaceId, filePath);
  },

  closeFile: (filePath: string) => {
    set((s) => {
      const openFiles = s.openFiles.filter((f) => f.path !== filePath);
      const activeFilePath =
        s.activeFilePath === filePath
          ? openFiles[openFiles.length - 1]?.path ?? null
          : s.activeFilePath;
      return { openFiles, activeFilePath };
    });
  },

  setActiveFile: (filePath: string) => {
    set({ activeFilePath: filePath });
  },

  toggleDir: (dirPath: string) => {
    const { expandedDirs, tree } = get();
    const expanded = new Set(expandedDirs);
    if (expanded.has(dirPath)) {
      expanded.delete(dirPath);
    } else {
      expanded.add(dirPath);
    }
    set({ expandedDirs: expanded });
    // Fetch after state update to avoid nested set() calls
    if (expanded.has(dirPath) && !tree[dirPath]) {
      get().fetchDirectory(dirPath);
    }
  },

  refreshAfterUpload: (workspaceRelativePath: string) => {
    const { tree, fetchDirectory } = get();
    const rootEntries = tree[ROOT_DIR_PATH];
    // Nothing was listed, so there is nothing on screen to refresh.
    if (!rootEntries) return;

    fetchDirectory(ROOT_DIR_PATH);

    const prefix = runtimeRootPrefix(rootEntries);
    if (prefix === null) return;

    // Refresh each folder on the way to the file, but only the folders
    // already listed. An unlisted folder loads when the user opens it.
    const directories = workspaceRelativePath.split('/').slice(0, -1);
    directories.reduce((parent, name) => {
      const key = `${parent}/${name}`;
      if (tree[key]) fetchDirectory(key);
      return key;
    }, prefix);
  },

  /**
   * Re-list the changed folders the tree already shows.
   *
   * A folder the tree never listed is left alone. It loads with its own
   * listing when the reader opens it.
   */
  applyChangedDirectories: (directories: string[]) => {
    const { tree, fetchDirectory } = get();
    const rootEntries = tree[ROOT_DIR_PATH];
    if (!rootEntries) return;

    const prefix = runtimeRootPrefix(rootEntries);
    // An empty root gives no path to read the prefix from, so any change
    // re-lists the root. That is the change that fills it.
    if (prefix === null) {
      fetchDirectory(ROOT_DIR_PATH);
      return;
    }

    const keys = new Set<string>();
    for (const directory of directories) {
      const key = directory === prefix ? ROOT_DIR_PATH : directory;
      if (tree[key]) keys.add(key);
    }
    for (const key of keys) fetchDirectory(key);
  },

  /** Forget everything. One tree belongs to one workspace. */
  resetTree: () => {
    set({
      tree: {},
      openFiles: [],
      activeFilePath: null,
      expandedDirs: new Set(),
      isLoading: false,
      _pendingListQueue: [],
      _pendingReadQueue: [],
    });
  },

  handleMessage: (msg: GatewayMessage) => {
    if (msg.type === 'file_tree_changed') {
      const directories = (msg as { directories?: unknown }).directories;
      if (!Array.isArray(directories)) return;
      get().applyChangedDirectories(directories.filter((d): d is string => typeof d === 'string'));
      return;
    }

    // Handle errors — clear loading state and dequeue
    if (msg.type === 'error' && 'requestType' in msg) {
      const errMsg = msg as { type: 'error'; requestType: string; message: string };
      if (errMsg.requestType === 'list_files') {
        console.warn('[files] list_files error:', errMsg.message);
        set((s) => ({
          isLoading: s._pendingListQueue.length > 1,
          _pendingListQueue: s._pendingListQueue.slice(1),
        }));
      }
      if (errMsg.requestType === 'read_file') {
        console.warn('[files] read_file error:', errMsg.message);
        set((s) => ({
          _pendingReadQueue: s._pendingReadQueue.slice(1),
        }));
      }
      return;
    }
    if (msg.type !== 'ok' || !('requestType' in msg)) return;

    const response = msg as { type: 'ok'; requestType: string; data?: unknown };

    if (response.requestType === 'list_files') {
      const data = response.data as { path: string; entries: FileEntry[] } | FileEntry[] | null;
      // Support both formats: { path, entries } or raw array (legacy)
      let dirPath: string;
      let entries: FileEntry[];
      if (data && 'path' in data && 'entries' in data) {
        dirPath = data.path;
        entries = data.entries;
      } else {
        // Fallback: dequeue the oldest pending path
        dirPath = get()._pendingListQueue[0] ?? '/';
        entries = (data as FileEntry[]) ?? [];
      }
      set((s) => ({
        tree: { ...s.tree, [dirPath]: entries },
        _pendingListQueue: s._pendingListQueue.filter((p) => p !== dirPath),
        isLoading: s._pendingListQueue.filter((p) => p !== dirPath).length > 0,
      }));
    }

    if (response.requestType === 'read_file') {
      const fileContent = response.data as FileContent;
      const filePath = get()._pendingReadQueue[0];
      if (!filePath || !fileContent) return;

      const openFile: OpenFile = {
        path: filePath,
        content: fileContent.content,
        mimeType: fileContent.mimeType,
        encoding: fileContent.encoding,
      };

      set((s) => ({
        openFiles: [...s.openFiles, openFile],
        activeFilePath: filePath,
        _pendingReadQueue: s._pendingReadQueue.slice(1),
      }));
    }
  },
}));
