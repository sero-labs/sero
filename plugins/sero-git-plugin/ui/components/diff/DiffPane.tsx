/**
 * DiffPane — the Git app's diff surface.
 *
 * Turns a selected file into the pair of revisions it should be compared
 * across, then renders it with @pierre/diffs. Nothing is asked of the
 * extension: the two sides are read straight from the host's git bridge, so a
 * diff appears as soon as a file is clicked.
 */

import { useMemo } from 'react';
import { useAppInfo, useTheme } from '@sero-ai/app-runtime';
import { isAddedOnFromSide, revsFor, type DiffSelection } from '../../lib/diff-revs';
import { toWorkspacePath } from '../../lib/repo-paths';
import { DiffChangeset, type DiffChangesetFile, type DiffStyle } from './DiffChangeset';

export type { DiffSelection };

interface Props {
  workspaceId: string;
  /** Repository root, which is not always the workspace root. */
  repoPath: string;
  selection: DiffSelection;
  diffStyle: DiffStyle;
}

export function DiffPane({ workspaceId, repoPath, selection, diffStyle }: Props) {
  const { mode, editorThemeId } = useTheme();
  const { workspacePath } = useAppInfo();
  const { fromRev, toRev } = useMemo(() => revsFor(selection), [selection]);
  const files = useMemo<DiffChangesetFile[]>(
    () => [{
      path: selection.path,
      diskPath: toWorkspacePath(workspacePath, repoPath, selection.path),
      oldPath: selection.oldPath,
      added: isAddedOnFromSide(selection.status),
      deleted: selection.status === 'deleted',
    }],
    [selection, workspacePath, repoPath],
  );

  return (
    <DiffChangeset
      key={`${workspaceId}:${fromRev}:${toRev}:${selection.path}`}
      workspaceId={workspaceId}
      fromRev={fromRev}
      toRev={toRev}
      files={files}
      diffStyle={diffStyle}
      editorThemeId={editorThemeId}
      themeType={mode}
    />
  );
}
