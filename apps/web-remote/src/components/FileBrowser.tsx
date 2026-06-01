/**
 * File browser, read-only tree view of workspace files.
 */

import { useCallback, memo } from 'react';
import { useFileStore } from '@/stores/files';
import { cn } from '@sero-ai/ui/lib/utils';
import type { FileEntry } from '@/lib/file-api';
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Loader2,
} from 'lucide-react';

interface FileTreeItemProps {
  entry: FileEntry;
  depth: number;
}

const FileTreeItem = memo(function FileTreeItem({
  entry,
  depth,
}: FileTreeItemProps) {
  const tree = useFileStore((s) => s.tree);
  const expandedDirs = useFileStore((s) => s.expandedDirs);
  const activeFilePath = useFileStore((s) => s.activeFilePath);
  const toggleDir = useFileStore((s) => s.toggleDir);
  const openFile = useFileStore((s) => s.openFile);

  const isDir = entry.type === 'directory';
  const isExpanded = expandedDirs.has(entry.path);
  const isActive = entry.path === activeFilePath;
  const children = tree[entry.path];

  const handleClick = useCallback(() => {
    if (isDir) {
      toggleDir(entry.path);
    } else {
      openFile(entry.path);
    }
  }, [isDir, entry.path, toggleDir, openFile]);

  return (
    <div>
      <button type="button"
        onClick={handleClick}
        className={cn(
          'w-full text-left flex items-center gap-1.5 py-1 px-2 text-sm',
          'hover:bg-accent/50 rounded transition-colors',
          isActive && 'bg-accent text-accent-foreground',
          !isActive && 'text-muted-foreground',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDir ? (
          <>
            {isExpanded ? (
              <ChevronDown className="size-3 shrink-0" />
            ) : (
              <ChevronRight className="size-3 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="size-4 shrink-0 text-yellow-500" />
            ) : (
              <Folder className="size-4 shrink-0 text-yellow-500" />
            )}
          </>
        ) : (
          <>
            <span className="size-3 shrink-0" />
            <File className="size-4 shrink-0" />
          </>
        )}
        <span className="truncate">{entry.name}</span>
      </button>

      {/* Children */}
      {isDir && isExpanded && (
        <div>
          {!children && (
            <div
              className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              <Loader2 className="size-3 animate-spin" />
              Loading…
            </div>
          )}
          {children?.map((child) => (
            <FileTreeItem
              key={child.path}
              entry={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export function FileBrowser() {
  const tree = useFileStore((s) => s.tree);
  const fetchDirectory = useFileStore((s) => s.fetchDirectory);
  const isLoading = useFileStore((s) => s.isLoading);

  const rootEntries = tree['/'] ?? tree['.'] ?? null;

  const handleLoadRoot = useCallback(() => {
    fetchDirectory('/');
  }, [fetchDirectory]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Files
        </span>
        {isLoading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {!rootEntries ? (
          <div className="px-3 py-4 text-center">
            <button type="button"
              onClick={handleLoadRoot}
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Load file tree
            </button>
          </div>
        ) : rootEntries.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground text-center">
            No files found
          </p>
        ) : (
          rootEntries.map((entry) => (
            <FileTreeItem key={entry.path} entry={entry} depth={0} />
          ))
        )}
      </div>
    </div>
  );
}
