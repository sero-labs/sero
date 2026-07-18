/**
 * DiffFileNavigator — changed-files tree for the diff view, built on
 * @pierre/trees. Every changed file shows a git-status lane; selecting a
 * file (click or keyboard) scrolls the changeset to it. Built-in search
 * filters the tree.
 */

import { FileTree, useFileTree } from '@pierre/trees/react';
import type { GitStatusEntry } from '@pierre/trees';
import type { FileDiffEntry, FileStatus } from '@sero-ai/common';
import './diff-view.css';

interface Props {
  files: FileDiffEntry[];
  /** Selected initially and scrolled into view. */
  initialPath?: string;
  /**
   * Called with the file path when the selection changes. Captured once at
   * model creation — pass a stable callback.
   */
  onSelectFile: (path: string) => void;
}

function toGitStatus(status: FileStatus): GitStatusEntry['status'] {
  switch (status) {
    case 'added':
    case 'copied':
      return 'added';
    case 'deleted':
      return 'deleted';
    case 'renamed':
      return 'renamed';
    default:
      return 'modified';
  }
}

export function DiffFileNavigator({ files, initialPath, onSelectFile }: Props) {
  const { model } = useFileTree({
    paths: files.map((f) => f.path),
    initialExpansion: 'open',
    initialSelectedPaths: initialPath ? [initialPath] : undefined,
    search: true,
    gitStatus: files.map((f): GitStatusEntry => ({ path: f.path, status: toGitStatus(f.status) })),
    onSelectionChange: (selectedPaths) => {
      const path = selectedPaths[0];
      if (path) onSelectFile(path);
    },
  });

  return <FileTree model={model} className="diff-file-navigator block h-full" />;
}
