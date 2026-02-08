import { useCallback, useEffect, useRef, useState } from "react";
import {
  syncDataLoaderFeature,
  selectionFeature,
  hotkeysCoreFeature,
  dragAndDropFeature,
  keyboardDragAndDropFeature,
  renamingFeature,
  createOnDropHandler,
} from "@headless-tree/core";
import { useTree, AssistiveTreeDescription } from "@headless-tree/react";
import {
  Tree,
  TreeDragLine,
  TreeItem,
  TreeItemLabel,
} from "@/components/ui/tree";
import { Input } from "@/components/ui/input";
import { FileIcon } from "./file-tree/file-icons";
import { FileTreeContextMenu } from "./file-tree/file-tree-context-menu";
import { moveItem, renameItem } from "./file-tree/file-tree-ops";

/* ── Types ────────────────────────────────────────────────────── */

interface FileItem {
  name: string;
  isDirectory: boolean;
  fileExtension?: string;
  /** Child item IDs. undefined = not yet loaded, [] = empty/leaf */
  children?: string[];
}

type ItemsMap = Record<string, FileItem>;

interface FileTreeProps {
  projectId: string;
  activePath: string | null;
  onFileSelect: (path: string) => void;
  /** Called after a file/directory is moved or renamed. oldPath → newPath. */
  onPathChanged?: (oldPath: string, newPath: string) => void;
  /** Called after a file/directory is deleted. */
  onDeleted?: (path: string) => void;
}

/* ── Constants ────────────────────────────────────────────────── */

const ROOT_ID = "/workspace";
const INDENT = 20;

function isHidden(name: string): boolean {
  if (name === ".env") return false;
  return name.startsWith(".");
}

/* ── Helpers ──────────────────────────────────────────────────── */

function sortEntries(
  entries: Array<{ name: string; type: "file" | "directory" }>
) {
  return entries
    .filter((e) => !isHidden(e.name))
    .sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "directory" ? -1 : 1;
    });
}

function getExtension(name: string): string | undefined {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : undefined;
}

function parentDir(path: string): string {
  return path.substring(0, path.lastIndexOf("/"));
}

function buildChildEntries(
  parentPath: string,
  rawEntries: Array<{ name: string; type: "file" | "directory"; size: number }>
): { childIds: string[]; newItems: ItemsMap } {
  const sorted = sortEntries(rawEntries);
  const childIds: string[] = [];
  const newItems: ItemsMap = {};

  for (const entry of sorted) {
    const id = `${parentPath}/${entry.name}`;
    childIds.push(id);
    newItems[id] = {
      name: entry.name,
      isDirectory: entry.type === "directory",
      fileExtension:
        entry.type === "file" ? getExtension(entry.name) : undefined,
      children: entry.type === "directory" ? undefined : [],
    };
  }

  return { childIds, newItems };
}

/* ── Component ────────────────────────────────────────────────── */

export function FileTree({
  projectId,
  activePath,
  onFileSelect,
  onPathChanged,
  onDeleted,
}: FileTreeProps) {
  const [items, setItems] = useState<ItemsMap>({
    [ROOT_ID]: { name: "workspace", isDirectory: true, children: undefined },
  });
  const [expandedItems, setExpandedItems] = useState<string[]>([ROOT_ID]);

  const loadingRef = useRef<Set<string>>(new Set());
  const expandedRef = useRef<Set<string>>(new Set([ROOT_ID]));

  /* ── Load directory ─────────────────────────────────────────── */

  const loadDirectory = useCallback(
    async (dirPath: string) => {
      if (loadingRef.current.has(dirPath)) return;
      loadingRef.current.add(dirPath);

      try {
        const rawEntries = await window.sero.container.listFiles(
          projectId,
          dirPath
        );
        const { childIds, newItems } = buildChildEntries(dirPath, rawEntries);

        setItems((prev) => {
          const next = { ...prev };
          next[dirPath] = { ...prev[dirPath], children: childIds };
          for (const [id, item] of Object.entries(newItems)) {
            if (
              prev[id] &&
              prev[id].isDirectory &&
              prev[id].children !== undefined
            ) {
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
        setItems((prev) => ({
          ...prev,
          [dirPath]: { ...prev[dirPath], children: [] },
        }));
      } finally {
        loadingRef.current.delete(dirPath);
      }
    },
    [projectId]
  );

  /* ── Load root on mount ─────────────────────────────────────── */

  useEffect(() => {
    loadDirectory(ROOT_ID);
  }, [loadDirectory]);

  /* ── Expanded items ─────────────────────────────────────────── */

  const handleSetExpandedItems = useCallback(
    (updater: string[] | ((old: string[]) => string[])) => {
      setExpandedItems((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        expandedRef.current = new Set(next);

        const prevSet = new Set(prev);
        for (const itemId of next) {
          if (!prevSet.has(itemId)) {
            setItems((currentItems) => {
              const item = currentItems[itemId];
              if (item?.isDirectory && item.children === undefined) {
                loadDirectory(itemId);
              }
              return currentItems;
            });
          }
        }
        return next;
      });
    },
    [loadDirectory]
  );

  /* ── Auto-expand ancestors of activePath ────────────────────── */

  useEffect(() => {
    if (!activePath) return;

    const parts = activePath.split("/").filter(Boolean);
    let current = "";
    const ancestors: string[] = [];
    for (let i = 0; i < parts.length - 1; i++) {
      current += "/" + parts[i];
      ancestors.push(current);
    }

    for (const dir of ancestors) {
      if (!items[dir] || items[dir].children === undefined) {
        loadDirectory(dir);
      }
    }

    setExpandedItems((prev) => {
      const set = new Set(prev);
      let changed = false;
      for (const dir of ancestors) {
        if (!set.has(dir)) {
          set.add(dir);
          changed = true;
        }
      }
      if (changed) {
        const next = Array.from(set);
        expandedRef.current = set;
        return next;
      }
      return prev;
    });
  }, [activePath, items, loadDirectory]);

  /* ── File watcher ───────────────────────────────────────────── */

  useEffect(() => {
    window.sero.filetree.watch(projectId);
    const cleanup = window.sero.filetree.onChanged((data) => {
      if (data.projectId !== projectId) return;
      for (const dir of data.directories) {
        if (expandedRef.current.has(dir)) loadDirectory(dir);
      }
    });
    return () => {
      cleanup();
      window.sero.filetree.unwatch(projectId);
    };
  }, [projectId, loadDirectory]);

  /* ── Drag & drop handler ────────────────────────────────────── */

  const handleDrop = createOnDropHandler<FileItem>(
    async (targetParent, newChildrenIds) => {
      const targetParentId = targetParent.getId();
      const prevChildren = items[targetParentId]?.children ?? [];
      const prevChildSet = new Set(prevChildren);

      // Find items that are new to this parent (moved here)
      const movedItems = newChildrenIds.filter((id) => !prevChildSet.has(id));

      for (const movedId of movedItems) {
        const fileName = movedId.split("/").pop()!;
        const newPath = `${targetParentId}/${fileName}`;

        if (movedId !== newPath) {
          const ok = await moveItem(projectId, movedId, newPath);
          if (!ok) return; // Abort on failure — watcher will refresh
          onPathChanged?.(movedId, newPath);
        }
      }

      // The file watcher will detect the changes and refresh both
      // source and destination directories automatically.
      // Reload the target parent to reflect the new order immediately.
      loadDirectory(targetParentId);
    }
  );

  /* ── Rename handler ─────────────────────────────────────────── */

  const handleRename = useCallback(
    async (item: { getId: () => string }, newName: string) => {
      const oldPath = item.getId();
      const trimmed = newName.trim();
      if (!trimmed || trimmed === oldPath.split("/").pop()) return;

      const newPath = await renameItem(projectId, oldPath, trimmed);
      if (!newPath) return;

      onPathChanged?.(oldPath, newPath);
      // Reload the parent directory — the watcher will also fire,
      // but we do it immediately for snappy UX
      loadDirectory(parentDir(oldPath));
    },
    [projectId, loadDirectory, onPathChanged]
  );

  /* ── Tree instance ──────────────────────────────────────────── */

  const tree = useTree<FileItem>({
    rootItemId: ROOT_ID,
    dataLoader: {
      getItem: (itemId) =>
        items[itemId] ?? {
          name: itemId.split("/").pop() ?? "?",
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
    getItemName: (item) => item.getItemData()?.name ?? "Unknown",
    isItemFolder: (item) => item.getItemData()?.isDirectory ?? false,
    indent: INDENT,
    canReorder: true,
    state: {
      expandedItems,
      selectedItems: activePath ? [activePath] : [],
    },
    setExpandedItems: handleSetExpandedItems,
    onPrimaryAction: (item) => {
      const data = item.getItemData();
      if (data && !data.isDirectory) {
        onFileSelect(item.getId());
      }
    },
    onDrop: handleDrop,
    onRename: handleRename,
    canRename: (item) => item.getId() !== ROOT_ID,
  });

  /* ── Rebuild tree when items data changes ───────────────────── */

  useEffect(() => {
    tree.rebuildTree();
  }, [items, tree]);

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <div
      className="flex h-full flex-col overflow-y-auto overflow-x-hidden"
      style={{ padding: 4 }}
    >
      <Tree
        className="before:-ms-1 relative before:absolute before:inset-0 before:bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(var(--tree-indent)-1px),var(--border)_calc(var(--tree-indent)-1px),var(--border)_calc(var(--tree-indent)))]"
        indent={INDENT}
        tree={tree}
      >
        <AssistiveTreeDescription tree={tree} />
        {tree.getItems().map((item) => (
          <FileTreeContextMenu
            key={item.getId()}
            itemPath={item.getId()}
            isFolder={item.isFolder()}
            isRoot={item.getId() === ROOT_ID}
            projectId={projectId}
            onStartRename={() => item.startRenaming()}
            onDeleted={onDeleted}
            onReloadDir={loadDirectory}
          >
            <TreeItem className="pb-0!" item={item}>
              <TreeItemLabel
                className="rounded-none"
                style={{ paddingBlock: 6 }}
              >
                <span className="flex items-center gap-2">
                  {!item.isFolder() && (
                    <FileIcon
                      extension={item.getItemData()?.fileExtension}
                      fileName={item.getItemData()?.name ?? ""}
                      className="text-muted-foreground pointer-events-none size-4"
                    />
                  )}
                  {item.isRenaming() ? (
                    <Input
                      {...item.getRenameInputProps()}
                      autoFocus
                      className="-my-0.5 h-6 px-1"
                    />
                  ) : (
                    item.getItemName()
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
