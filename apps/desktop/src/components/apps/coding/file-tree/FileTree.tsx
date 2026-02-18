import { useCallback, useEffect, useRef, useState } from 'react';
import {
  syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature,
  dragAndDropFeature, keyboardDragAndDropFeature, renamingFeature,
  createOnDropHandler,
} from '@headless-tree/core';
import { useTree, AssistiveTreeDescription } from '@headless-tree/react';
import { Tree, TreeDragLine, TreeItem, TreeItemLabel } from '@/components/ui/tree';
import { Input } from '@/components/ui/input';
import { FileIcon } from './file-icons';
import { FileTreeContextMenu } from './file-tree-context-menu';
import { moveItem, renameItem } from './file-tree-ops';
import { cn } from '@/lib/utils';
import { useContainerStore } from '@/stores/container';
import { useActiveWorkspace } from '@/stores/workspace';

/* ── Types ───────────────────────────────────────────────────── */

interface FileItem {
  name: string;
  isDirectory: boolean;
  fileExtension?: string;
  children?: string[];
}

type ItemsMap = Record<string, FileItem>;

interface FileTreeProps {
  workspaceId: string;
  rootId: string;
  activePath: string | null;
  onFileSelect: (path: string) => void;
  onPathChanged?: (oldPath: string, newPath: string) => void;
  onDeleted?: (path: string) => void;
}

/* ── Constants & helpers ─────────────────────────────────────── */

const INDENT = 20;

function isHidden(name: string): boolean {
  if (name === '.env') return false;
  return name.startsWith('.');
}

function sortEntries(entries: Array<{ name: string; type: 'file' | 'directory' }>) {
  return entries.filter((e) => !isHidden(e.name)).sort((a, b) => {
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

/* ── Component ───────────────────────────────────────────────── */

export function FileTree({
  workspaceId, rootId, activePath, onFileSelect, onPathChanged, onDeleted,
}: FileTreeProps) {
  const [items, setItems] = useState<ItemsMap>({
    [rootId]: { name: rootId.split('/').pop() ?? 'workspace', isDirectory: true, children: undefined },
  });
  const [expandedItems, setExpandedItems] = useState<string[]>([rootId]);

  const loadingRef = useRef<Set<string>>(new Set());
  const expandedRef = useRef<Set<string>>(new Set([rootId]));

  // Container readiness — mirrors the pattern in EditorPanel.
  // Non-container workspaces are always ready; container workspaces
  // must wait for the container to reach "running" status.
  const containerStatus = useContainerStore(
    (s) => s.containers[workspaceId]?.status ?? 'none',
  );
  const activeWorkspace = useActiveWorkspace();
  const isContainerWorkspace = activeWorkspace?.container ?? true;
  const isReady = isContainerWorkspace ? containerStatus === 'running' : true;

  /* ── Reset state when workspace / root changes ────────────
   *
   * `items` is initialised once on mount. When the user switches to a
   * different workspace (or the rootId changes), the old entries are
   * stale and the new rootId may not exist in the map at all, leaving
   * the tree empty. Reset to a fresh root entry so the subsequent
   * `loadDirectory` effect populates it correctly.
   */
  const prevWorkspaceRef = useRef(workspaceId);
  const prevRootRef = useRef(rootId);

  useEffect(() => {
    if (prevWorkspaceRef.current === workspaceId && prevRootRef.current === rootId) return;
    prevWorkspaceRef.current = workspaceId;
    prevRootRef.current = rootId;

    loadingRef.current.clear();
    setItems({
      [rootId]: { name: rootId.split('/').pop() ?? 'workspace', isDirectory: true, children: undefined },
    });
    setExpandedItems([rootId]);
    expandedRef.current = new Set([rootId]);
  }, [workspaceId, rootId]);

  /* ── Load directory ──────────────────────────────────────── */

  const loadDirectory = useCallback(async (dirPath: string) => {
    if (!isReady) return; // Container not running yet — skip to avoid errors
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
    } catch (err) {
      console.warn(`[FileTree] Failed to load ${dirPath}:`, err);
      setItems((prev) => ({ ...prev, [dirPath]: { ...prev[dirPath], children: [] } }));
    } finally {
      loadingRef.current.delete(dirPath);
    }
  }, [workspaceId, isReady]);

  /* ── Load root on mount / when container becomes ready ──── */

  useEffect(() => { loadDirectory(rootId); }, [loadDirectory, rootId]);

  /* ── Expanded items ──────────────────────────────────────── */

  const handleSetExpandedItems = useCallback(
    (updater: string[] | ((old: string[]) => string[])) => {
      setExpandedItems((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        expandedRef.current = new Set(next);
        const prevSet = new Set(prev);
        for (const itemId of next) {
          if (!prevSet.has(itemId)) {
            setItems((currentItems) => {
              const item = currentItems[itemId];
              if (item?.isDirectory && item.children === undefined) loadDirectory(itemId);
              return currentItems;
            });
          }
        }
        return next;
      });
    },
    [loadDirectory],
  );

  /* ── Auto-expand ancestors of activePath ─────────────────── */

  useEffect(() => {
    if (!activePath) return;
    const parts = activePath.split('/').filter(Boolean);
    let current = '';
    const ancestors: string[] = [];
    for (let i = 0; i < parts.length - 1; i++) {
      current += '/' + parts[i];
      ancestors.push(current);
    }
    for (const dir of ancestors) {
      if (!items[dir] || items[dir].children === undefined) loadDirectory(dir);
    }
    setExpandedItems((prev) => {
      const set = new Set(prev);
      let changed = false;
      for (const dir of ancestors) {
        if (!set.has(dir)) { set.add(dir); changed = true; }
      }
      if (changed) { const next = Array.from(set); expandedRef.current = set; return next; }
      return prev;
    });
  }, [activePath, items, loadDirectory]);

  /* ── File watcher ────────────────────────────────────────── */

  useEffect(() => {
    window.sero.filetree.watch(workspaceId);
    const cleanup = window.sero.filetree.onChanged((data) => {
      if (data.workspaceId !== workspaceId) return;
      for (const dir of data.directories) {
        if (expandedRef.current.has(dir)) loadDirectory(dir);
      }
    });
    return () => { cleanup(); window.sero.filetree.unwatch(workspaceId); };
  }, [workspaceId, loadDirectory]);

  useEffect(() => {
    const cleanup = window.sero.vcs.onEvent((event) => {
      if (event.type !== 'restored' || event.workspaceId !== workspaceId) return;
      for (const dir of expandedRef.current) {
        loadDirectory(dir);
      }
    });
    return cleanup;
  }, [workspaceId, loadDirectory]);

  /* ── Drag & drop ─────────────────────────────────────────── */

  const handleDrop = createOnDropHandler<FileItem>(async (targetParent, newChildrenIds) => {
    const targetParentId = targetParent.getId();
    const prevChildren = items[targetParentId]?.children ?? [];
    const prevChildSet = new Set(prevChildren);
    const movedItems = newChildrenIds.filter((id) => !prevChildSet.has(id));
    for (const movedId of movedItems) {
      const fileName = movedId.split('/').pop()!;
      const newPath = `${targetParentId}/${fileName}`;
      if (movedId !== newPath) {
        const ok = await moveItem(workspaceId, movedId, newPath);
        if (!ok) return;
        onPathChanged?.(movedId, newPath);
      }
    }
    loadDirectory(targetParentId);
  });

  /* ── Rename ──────────────────────────────────────────────── */

  const handleRename = useCallback(
    async (item: { getId: () => string }, newName: string) => {
      const oldPath = item.getId();
      const trimmed = newName.trim();
      if (!trimmed || trimmed === oldPath.split('/').pop()) return;
      const newPath = await renameItem(workspaceId, oldPath, trimmed);
      if (!newPath) return;
      onPathChanged?.(oldPath, newPath);
      loadDirectory(parentDir(oldPath));
    },
    [workspaceId, loadDirectory, onPathChanged],
  );

  /* ── Tree instance ───────────────────────────────────────── */

  const tree = useTree<FileItem>({
    rootItemId: rootId,
    dataLoader: {
      getItem: (itemId) => items[itemId] ?? { name: itemId.split('/').pop() ?? '?', isDirectory: false, children: [] },
      getChildren: (itemId) => items[itemId]?.children ?? [],
    },
    features: [
      syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature,
      dragAndDropFeature, keyboardDragAndDropFeature, renamingFeature,
    ],
    getItemName: (item) => item.getItemData()?.name ?? 'Unknown',
    isItemFolder: (item) => item.getItemData()?.isDirectory ?? false,
    indent: INDENT,
    canReorder: true,
    state: { expandedItems, selectedItems: activePath ? [activePath] : [] },
    setExpandedItems: handleSetExpandedItems,
    onPrimaryAction: (item) => {
      const data = item.getItemData();
      if (data && !data.isDirectory) onFileSelect(item.getId());
    },
    onDrop: handleDrop,
    onRename: handleRename,
    canRename: (item) => item.getId() !== rootId,
  });

  useEffect(() => { tree.rebuildTree(); }, [items, tree]);

  /* ── Render ──────────────────────────────────────────────── */

  return (
    <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden">
      <Tree indent={INDENT} tree={tree} className="py-1">
        <AssistiveTreeDescription tree={tree} />
        {tree.getItems().map((item) => (
          <FileTreeContextMenu
            key={item.getId()} itemPath={item.getId()}
            isFolder={item.isFolder()} isRoot={item.getId() === rootId}
            workspaceId={workspaceId} onStartRename={() => item.startRenaming()}
            onDeleted={onDeleted} onReloadDir={loadDirectory}
          >
            <TreeItem
              item={item}
              className="hover:bg-white/[0.06] data-[selected=true]:bg-white/[0.10]"
            >
              <TreeItemLabel className="!px-1.5 !py-[3px]">
                <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
                  {!item.isFolder() && (
                    <FileIcon
                      extension={item.getItemData()?.fileExtension}
                      fileName={item.getItemData()?.name ?? ''}
                      className="text-muted-foreground/70 pointer-events-none size-4 shrink-0"
                    />
                  )}
                  {item.isRenaming() ? (
                    <Input {...item.getRenameInputProps()} autoFocus className="-my-0.5 h-5 px-1 text-[13px]" />
                  ) : (
                    <span className={cn(
                      'truncate',
                      item.isFolder() ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-primary)]',
                    )}>
                      {item.getItemName()}
                    </span>
                  )}
                </span>
              </TreeItemLabel>
            </TreeItem>
          </FileTreeContextMenu>
        ))}
        <TreeDragLine />
      </Tree>
    </div>
  );
}
