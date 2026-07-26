/**
 * DiffPane — the diff surface shared by both git views.
 *
 * Turns a selection into the pair of revisions it should be compared across,
 * then renders it with @pierre/diffs. File contents are read straight from the
 * host bridge, so a diff appears as soon as something is clicked.
 *
 * A whole commit needs its file list first; a single file does not.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAppInfo, useTheme } from '@sero-ai/app-runtime';
import type { FileStatus } from '@sero-ai/common';
import { isAddedOnFromSide, revsFor, type DiffSelection } from '../../lib/diff-revs';
import { toWorkspacePath } from '../../lib/repo-paths';
import { useVcsStore } from '../../store/vcs-store';
import { DiffChangeset, type DiffChangesetFile, type DiffStyle } from './DiffChangeset';

export type { DiffSelection };

/** `FileStatus` (the vcs summary vocabulary) in the app's change vocabulary. */
function fromFileStatus(status: FileStatus): 'added' | 'deleted' | 'modified' | 'renamed' {
  if (status === 'added' || status === 'deleted' || status === 'renamed') return status;
  return 'modified';
}

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
  const fetchDiffFiles = useVcsStore((s) => s.fetchDiffFiles);
  const { fromRev, toRev } = useMemo(() => revsFor(selection), [selection]);

  // A commit's file list has to be fetched; every other selection names its file.
  const [commitFiles, setCommitFiles] = useState<DiffChangesetFile[] | null>(null);
  const isCommit = selection.kind === 'commit';

  useEffect(() => {
    if (!isCommit) return;
    let cancelled = false;
    setCommitFiles(null);
    void fetchDiffFiles(workspaceId, fromRev, toRev)
      .then((entries) => {
        if (cancelled) return;
        setCommitFiles(entries.map((entry) => ({
          path: entry.path,
          diskPath: toWorkspacePath(workspacePath, repoPath, entry.path),
          oldPath: entry.oldPath,
          added: isAddedOnFromSide(fromFileStatus(entry.status)),
          deleted: fromFileStatus(entry.status) === 'deleted',
        })));
      })
      .catch(() => { if (!cancelled) setCommitFiles([]); });
    return () => { cancelled = true; };
  }, [isCommit, workspaceId, fromRev, toRev, workspacePath, repoPath, fetchDiffFiles]);

  const singleFile = useMemo<DiffChangesetFile[] | null>(
    () => (selection.kind === 'commit' ? null : [{
      path: selection.path,
      diskPath: toWorkspacePath(workspacePath, repoPath, selection.path),
      oldPath: selection.oldPath,
      added: isAddedOnFromSide(selection.status),
      deleted: selection.status === 'deleted',
    }]),
    [selection, workspacePath, repoPath],
  );

  const files = singleFile ?? commitFiles;
  if (!files) return <DiffMessage>Loading…</DiffMessage>;
  if (files.length === 0) return <DiffMessage>Nothing changed here.</DiffMessage>;

  return (
    <DiffChangeset
      key={`${workspaceId}:${fromRev}:${toRev}:${selection.kind === 'commit' ? '' : selection.path}`}
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

function DiffMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
      {children}
    </div>
  );
}
