import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createOnDropHandler,
  dragAndDropFeature,
  hotkeysCoreFeature,
  keyboardDragAndDropFeature,
  renamingFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
import { moveItem, renameItem } from './file-tree-ops';

interface FileItem {
  name: string;
  isDirectory: boolean;
  fileExtension?: string;
  children?: string[];
}

type ItemsMap = Record<string, FileItem>;

export interface FileTreeModelOptions {
  workspaceId: string;
  rootId: string;
  activePath: string | null;
  onFileSelect: (path: string) => void;
  onPathChanged?: (oldPath: string, newPath: string) => void;
  onDeleted?: (path: string) => void;
}

const INDENT = 20;

function createRootItem(rootId: string): FileItem {
  return {
    name: rootId.split('/').pop() ?? 'workspace',
    isDirectory: true,
    children: undefined,
  };
}

function isHidden(name: string): boolean {
  if (name === '.env') return false;
  return name.startsWith('.');
}

function sortEntries(entries: Array<{ name: string; type: 'file' | 'directory' }>) {
  return entries.filter((entry) => !isHidden(entry.name)).sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });
}

function getExtension(name: string): string | undefined {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : undefined;
}

function parentDir(path: string): string {
  return path.substring(0, path.lastIndexOf('/'));
}

function buildChildEntries(
  parentPath: string,
  rawEntries: Array<{ name: string; type: 'file' | 'directory'; size: number }>,
): { childIds: string[]; newItems: ItemsMap } {
  const sorted = sortEntries(rawEntries);
  const childIds: string[] = [];
  const newItems: ItemsMap = {};
  for (const entry of sorted) {
    const id = `${parentPath}/${entry.name}`;
    childIds.push(id);
    newItems[id] = {
      name: entry.name,
      isDirectory: entry.type === 'directory',
      fileExtension: entry.type === 'file' ? getExtension(entry.name) : undefined,
      children: entry.type === 'directory' ? undefined : [],
    };
  }
  return { childIds, newItems };
}

export function useFileTreeModel({
  workspaceId,
  rootId,
  activePath,
  onFileSelect,
  onPathChanged,
}: FileTreeModelOptions) {
  const [items, setItems] = useState<ItemsMap>({
    [rootId]: createRootItem(rootId),
  });
  const [expandedItems, setExpandedItems] = useState<string[]>([rootId]);

  const loadingRef = useRef<Set<string>>(new Set());
  const expandedRef = useRef<Set<string>>(new Set([rootId]));
  const prevWorkspaceRef = useRef(workspaceId);
  const prevRootRef = useRef(rootId);

  const loadDirectory = useCallback(async (dirPath: string) => {
    if (loadingRef.current.has(dirPath)) return;
    loadingRef.current.add(dirPath);
    try {
      const rawEntries = await window.sero.editor.listFiles(workspaceId, dirPath);
      const { childIds, newItems } = buildChildEntries(dirPath, rawEntries);
      setItems((prev) => {
        const next = { ...prev };
        next[dirPath] = { ...prev[dirPath], children: childIds };
        for (const [id, item] of Object.entries(newItems)) {
          if (prev[id] && prev[id].isDirectory && prev[id].children !== undefined) {
            next[id] = { ...item, children: prev[id].children };
          } else {
            next[id] = item;
          }
        }
        const prevChildren = prev[dirPath]?.children ?? [];
        const newChildSet = new Set(childIds);
        for (const oldId of prevChildren) {
          if (!newChildSet.has(oldId)) delete next[oldId];
        }
        return next;
      });
    } catch (error) {
      console.warn(`[FileTree] Failed to load ${dirPath}:`, error);
      setItems((prev) => ({
        ...prev,
        [dirPath]: { ...prev[dirPath], children: [] },
      }));
    } finally {
      loadingRef.current.delete(dirPath);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (prevWorkspaceRef.current === workspaceId && prevRootRef.current === rootId) {
      return;
    }
    prevWorkspaceRef.current = workspaceId;
    prevRootRef.current = rootId;

    loadingRef.current.clear();
    setItems({ [rootId]: createRootItem(rootId) });
    setExpandedItems([rootId]);
    expandedRef.current = new Set([rootId]);
  }, [workspaceId, rootId]);

  useEffect(() => {
    void loadDirectory(rootId);
  }, [loadDirectory, rootId]);

  const handleSetExpandedItems = useCallback(
    (updater: string[] | ((old: string[]) => string[])) => {
      setExpandedItems((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        expandedRef.current = new Set(next);
        const prevSet = new Set(prev);
        for (const itemId of next) {
          if (prevSet.has(itemId)) continue;
          setItems((currentItems) => {
            const item = currentItems[itemId];
            if (item?.isDirectory && item.children === undefined) {
              void loadDirectory(itemId);
            }
            return currentItems;
          });
        }
        return next;
      });
    },
    [loadDirectory],
  );

  useEffect(() => {
    if (!activePath) return;
    const parts = activePath.split('/').filter(Boolean);
    let current = '';
    const ancestors: string[] = [];
    for (let i = 0; i < parts.length - 1; i += 1) {
      current += `/${parts[i]}`;
      ancestors.push(current);
    }
    for (const dir of ancestors) {
      if (!items[dir] || items[dir].children === undefined) {
        void loadDirectory(dir);
      }
    }
    setExpandedItems((prev) => {
      const nextSet = new Set(prev);
      let changed = false;
      for (const dir of ancestors) {
        if (nextSet.has(dir)) continue;
        nextSet.add(dir);
        changed = true;
      }
      if (!changed) return prev;
      expandedRef.current = nextSet;
      return Array.from(nextSet);
    });
  }, [activePath, items, loadDirectory]);

  useEffect(() => {
    return window.sero.filetree.onChanged((data) => {
      if (data.workspaceId !== workspaceId) return;
      for (const dir of data.directories) {
        if (expandedRef.current.has(dir)) {
          void loadDirectory(dir);
        }
      }
    });
  }, [workspaceId, loadDirectory]);

  useEffect(() => {
    return window.sero.vcs.onEvent((event) => {
      if (event.type !== 'restored' || event.workspaceId !== workspaceId) return;
      for (const dir of expandedRef.current) {
        void loadDirectory(dir);
      }
    });
  }, [workspaceId, loadDirectory]);

  const handleDrop = createOnDropHandler<FileItem>(async (targetParent, newChildrenIds) => {
    const targetParentId = targetParent.getId();
    const prevChildren = items[targetParentId]?.children ?? [];
    const prevChildSet = new Set(prevChildren);
    const movedItems = newChildrenIds.filter((id) => !prevChildSet.has(id));
    const allMoved = await movedItems.reduce<Promise<boolean>>((previous, movedId) => previous.then((previousOk) => {
      if (!previousOk) return false;
      const fileName = movedId.split('/').pop();
      if (!fileName) return true;
      const newPath = `${targetParentId}/${fileName}`;
      if (movedId === newPath) return true;
      return moveItem(workspaceId, movedId, newPath).then((ok) => {
        if (!ok) return false;
        onPathChanged?.(movedId, newPath);
        return true;
      });
    }), Promise.resolve(true));
    if (!allMoved) return;
    await loadDirectory(targetParentId);
  });

  const handleRename = useCallback(
    async (item: { getId: () => string }, newName: string) => {
      const oldPath = item.getId();
      const trimmed = newName.trim();
      if (!trimmed || trimmed === oldPath.split('/').pop()) return;
      const newPath = await renameItem(workspaceId, oldPath, trimmed);
      if (!newPath) return;
      onPathChanged?.(oldPath, newPath);
      await loadDirectory(parentDir(oldPath));
    },
    [workspaceId, loadDirectory, onPathChanged],
  );

  const tree = useTree<FileItem>({
    rootItemId: rootId,
    dataLoader: {
      getItem: (itemId) => items[itemId] ?? {
        name: itemId.split('/').pop() ?? '?',
        isDirectory: false,
        children: [],
      },
      getChildren: (itemId) => items[itemId]?.children ?? [],
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      dragAndDropFeature,
      keyboardDragAndDropFeature,
      renamingFeature,
    ],
    getItemName: (item) => item.getItemData()?.name ?? 'Unknown',
    isItemFolder: (item) => item.getItemData()?.isDirectory ?? false,
    indent: INDENT,
    canReorder: true,
    state: { expandedItems, selectedItems: activePath ? [activePath] : [] },
    setExpandedItems: handleSetExpandedItems,
    onPrimaryAction: (item) => {
      const data = item.getItemData();
      if (data && !data.isDirectory) {
        onFileSelect(item.getId());
      }
    },
    onDrop: handleDrop,
    onRename: handleRename,
    canRename: (item) => item.getId() !== rootId,
  });

  useEffect(() => {
    // Headless Tree keeps internal derived structure that does not fully refresh
    // when our async item map mutates. Contain the broad rebuild in the model
    // hook so FileTree stays a pure render shell until the library exposes a
    // narrower invalidation API.
    tree.rebuildTree();
  }, [items, tree]);

  return {
    indent: INDENT,
    loadDirectory,
    tree,
  };
}
