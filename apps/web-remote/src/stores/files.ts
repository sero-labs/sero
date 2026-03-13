/**
 * File browser store — file tree, open files, and preview state.
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

  /** Track pending requests to know which path a response maps to. */
  _pendingListPath: string | null;
  _pendingReadPath: string | null;
}

export const useFileStore = create<FileStore>((set, get) => ({
  tree: {},
  openFiles: [],
  activeFilePath: null,
  expandedDirs: new Set(),
  isLoading: false,
  _pendingListPath: null,
  _pendingReadPath: null,

  fetchDirectory: (dirPath: string) => {
    const { activeWorkspaceId } = useWorkspaceStore.getState();
    if (!activeWorkspaceId) return;

    set({ isLoading: true, _pendingListPath: dirPath });
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

    set({ _pendingReadPath: filePath });
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
    // Handle errors — clear loading state
    if (msg.type === 'error' && 'requestType' in msg) {
      const errMsg = msg as { type: 'error'; requestType: string; message: string };
      if (errMsg.requestType === 'list_files') {
        console.warn('[files] list_files error:', errMsg.message);
        set({ isLoading: false, _pendingListPath: null });
      }
      if (errMsg.requestType === 'read_file') {
        console.warn('[files] read_file error:', errMsg.message);
        set({ _pendingReadPath: null });
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
        dirPath = get()._pendingListPath ?? '/';
        entries = (data as FileEntry[]) ?? [];
      }
      set((s) => ({
        tree: { ...s.tree, [dirPath]: entries },
        isLoading: false,
        _pendingListPath: null,
      }));
    }

    if (response.requestType === 'read_file') {
      const fileContent = response.data as FileContent;
      const filePath = get()._pendingReadPath;
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
        _pendingReadPath: null,
      }));
    }
  },
}));
