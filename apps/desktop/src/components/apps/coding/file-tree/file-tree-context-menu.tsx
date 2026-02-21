/**
 * Right-click context menu for file tree items.
 * Provides: New File, New Folder, Rename, Delete, Copy Path.
 */

import { useCallback, useRef, useState } from 'react';
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut,
} from '@sero/ui/components/ui/context-menu';
import { Input } from '@sero/ui/components/ui/input';
import {
  RiPencilLine, RiDeleteBinLine, RiFileLine,
  RiFolderLine, RiClipboardLine,
} from '@remixicon/react';
import { createFile, createFolder, deleteItem } from './file-tree-ops';

interface FileTreeContextMenuProps {
  children: React.ReactNode;
  itemPath: string;
  isFolder: boolean;
  isRoot: boolean;
  workspaceId: string;
  onStartRename: () => void;
  onDeleted?: (path: string) => void;
  onReloadDir: (dirPath: string) => void;
}

type NewItemMode = 'file' | 'folder' | null;

export function FileTreeContextMenu({
  children, itemPath, isFolder, isRoot, workspaceId,
  onStartRename, onDeleted, onReloadDir,
}: FileTreeContextMenuProps) {
  const [newItemMode, setNewItemMode] = useState<NewItemMode>(null);
  const [newItemName, setNewItemName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const targetDir = isFolder ? itemPath : itemPath.substring(0, itemPath.lastIndexOf('/'));

  const handleCopyPath = useCallback(() => {
    navigator.clipboard.writeText(itemPath);
  }, [itemPath]);

  const handleDelete = useCallback(async () => {
    if (isRoot) return;
    const ok = await deleteItem(workspaceId, itemPath);
    if (ok) onDeleted?.(itemPath);
  }, [workspaceId, itemPath, isRoot, onDeleted]);

  const resetNewItem = useCallback(() => {
    setNewItemMode(null);
    setNewItemName('');
  }, []);

  const handleNewItemSubmit = useCallback(async () => {
    const name = newItemName.trim();
    if (!name || !newItemMode) { resetNewItem(); return; }

    const fullPath = `${targetDir}/${name}`;
    const ok = newItemMode === 'file'
      ? await createFile(workspaceId, fullPath)
      : await createFolder(workspaceId, fullPath);

    if (ok) onReloadDir(targetDir);
    resetNewItem();
  }, [newItemName, newItemMode, targetDir, workspaceId, onReloadDir, resetNewItem]);

  const handleNewItemKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); handleNewItemSubmit(); }
      else if (e.key === 'Escape') resetNewItem();
    },
    [handleNewItemSubmit, resetNewItem],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => { if (!open) resetNewItem(); },
    [resetNewItem],
  );

  return (
    <ContextMenu onOpenChange={handleOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {newItemMode ? (
          <div className="px-2 py-1.5">
            <Input
              ref={inputRef} autoFocus className="-my-0.5 h-7 px-2 text-sm"
              placeholder={newItemMode === 'file' ? 'filename.ext' : 'folder-name'}
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={handleNewItemKeyDown}
              onBlur={handleNewItemSubmit}
            />
          </div>
        ) : (
          <>
            <ContextMenuItem onSelect={(e) => {
              e.preventDefault();
              setNewItemMode('file');
              requestAnimationFrame(() => inputRef.current?.focus());
            }}>
              <RiFileLine /> New File
            </ContextMenuItem>
            <ContextMenuItem onSelect={(e) => {
              e.preventDefault();
              setNewItemMode('folder');
              requestAnimationFrame(() => inputRef.current?.focus());
            }}>
              <RiFolderLine /> New Folder
            </ContextMenuItem>
          </>
        )}

        {!isRoot && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onStartRename}>
              <RiPencilLine /> Rename
              <ContextMenuShortcut>F2</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onSelect={handleDelete}>
              <RiDeleteBinLine /> Delete
            </ContextMenuItem>
          </>
        )}

        <ContextMenuSeparator />
        <ContextMenuItem onSelect={handleCopyPath}>
          <RiClipboardLine /> Copy Path
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
