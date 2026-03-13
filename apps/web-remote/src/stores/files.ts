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
  handleMessage: (msg: GatewayMessage) => void;

  /** Queues for pending requests — supports concurrent in-flight requests. */
  _pendingListQueue: string[];
  _pendingReadQueue: string[];
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

  handleMessage: (msg: GatewayMessage) => {
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
