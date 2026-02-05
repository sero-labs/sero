import React, { useCallback, useEffect, useState } from 'react';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
}

interface FileTreeNodeProps {
  projectId: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  depth: number;
  activePath: string | null;
  onFileSelect: (path: string) => void;
}

function FileTreeNode({ projectId, name, path, type, depth, activePath, onFileSelect }: FileTreeNodeProps) {
  // Auto-expand if this directory is an ancestor of the active file
  const isDir = type === 'directory';
  const isAncestorOfActive = isDir && activePath != null && activePath.startsWith(path + '/');
  const [expanded, setExpanded] = useState(depth === 0 || isAncestorOfActive);
  const [children, setChildren] = useState<FileEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const isActive = activePath === path;

  // Expand when activePath changes to a descendant
  useEffect(() => {
    if (isAncestorOfActive && !expanded) {
      setExpanded(true);
    }
  }, [isAncestorOfActive]);

  const loadChildren = useCallback(async () => {
    if (!isDir || loaded) return;
    try {
      const files: FileEntry[] = await window.sero.container.listFiles(projectId, path);
      const sorted = files
        .filter((f) => !f.name.startsWith('.') || f.name === '.env')
        .sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'directory' ? -1 : 1;
        });
      setChildren(sorted);
      setLoaded(true);
    } catch {
      setChildren([]);
    }
  }, [projectId, path, isDir, loaded]);

  const handleClick = useCallback(() => {
    if (isDir) {
      if (!loaded) loadChildren();
      setExpanded((v) => !v);
    } else {
      onFileSelect(path);
    }
  }, [isDir, loaded, loadChildren, onFileSelect, path]);

  // Auto-refresh expanded dirs periodically
  useEffect(() => {
    if (!isDir || !expanded) return;
    loadChildren();
    const interval = setInterval(() => {
      setLoaded(false); // Force reload next tick
    }, 8000);
    return () => clearInterval(interval);
  }, [isDir, expanded, loadChildren]);

  // Reload when marked as not loaded
  useEffect(() => {
    if (!loaded && expanded && isDir) {
      loadChildren();
    }
  }, [loaded, expanded, isDir, loadChildren]);

  const icon = isDir ? (expanded ? '📂' : '📁') : fileIcon(name);

  return (
    <>
      <button
        className={`ftree-node ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={handleClick}
        title={path}
      >
        {isDir && (
          <span className={`ftree-chevron ${expanded ? 'expanded' : ''}`}>▸</span>
        )}
        <span className="ftree-icon">{icon}</span>
        <span className="ftree-name">{name}</span>
      </button>
      {isDir && expanded &&
        children.map((child) => (
          <FileTreeNode
            key={child.name}
            projectId={projectId}
            name={child.name}
            path={`${path}/${child.name}`}
            type={child.type}
            depth={depth + 1}
            activePath={activePath}
            onFileSelect={onFileSelect}
          />
        ))}
    </>
  );
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const icons: Record<string, string> = {
    ts: '🟦', tsx: '⚛️', js: '🟨', jsx: '⚛️',
    json: '📋', md: '📝', css: '🎨', html: '🌐',
    py: '🐍', rs: '🦀', go: '🔷', sh: '⬛',
    yml: '⚙️', yaml: '⚙️', toml: '⚙️',
    svg: '🖼️', png: '🖼️', jpg: '🖼️',
    lock: '🔒', gitignore: '👁️',
  };
  return icons[ext] ?? '📄';
}

interface FileTreeProps {
  projectId: string;
  activePath: string | null;
  onFileSelect: (path: string) => void;
}

export function FileTree({ projectId, activePath, onFileSelect }: FileTreeProps) {
  return (
    <div className="ftree">
      <FileTreeNode
        projectId={projectId}
        name="workspace"
        path="/workspace"
        type="directory"
        depth={0}
        activePath={activePath}
        onFileSelect={onFileSelect}
      />
    </div>
  );
}
