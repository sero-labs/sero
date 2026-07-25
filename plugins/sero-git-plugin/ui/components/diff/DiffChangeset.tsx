/**
 * DiffChangeset — changeset diff viewer built on @pierre/diffs CodeView.
 *
 * Loads each file's old/new contents over the host bridge in small batches and
 * appends them to the CodeView as they arrive, so the first files paint while
 * the rest of a large changeset is still loading.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseDiffFromFile } from '@pierre/diffs';
import type { CodeViewItem, CodeViewOptions } from '@pierre/diffs';
import { CodeView, type CodeViewHandle } from '@pierre/diffs/react';
import { WORKING_TREE_REV } from '@sero-ai/common';
import { readFileAtRev, readWorkingTreeFile } from '../../lib/sero-vcs';
import { resolveDiffThemes } from './diff-themes';
import './diff-view.css';

/** Files fetched per batch — bounds concurrent bridge calls. */
const LOAD_BATCH_SIZE = 8;

export type DiffStyle = 'split' | 'unified';

/** One file to diff, and where to read its two sides from. */
export interface DiffChangesetFile {
  /** Repo-relative path — the id, the label, and what git revisions are read by. */
  path: string;
  /**
   * Workspace-relative path used for working-tree reads, which go through the
   * host's file bridge. Null when the file lies outside the workspace.
   */
  diskPath: string | null;
  /** Path on the `from` side when it differs (renames). */
  oldPath?: string;
  /** Skip reading the `from` side — the file did not exist there. */
  added?: boolean;
  /** Skip reading the `to` side — the file does not exist there. */
  deleted?: boolean;
}

interface Props {
  workspaceId: string;
  fromRev: string;
  toRev: string;
  files: DiffChangesetFile[];
  diffStyle: DiffStyle;
  editorThemeId: string;
  themeType: 'light' | 'dark';
}

export function DiffChangeset({
  workspaceId, fromRev, toRev, files, diffStyle, editorThemeId, themeType,
}: Props) {
  const codeViewRef = useRef<CodeViewHandle<undefined>>(null);
  const [unreadable, setUnreadable] = useState<string[]>([]);

  const options = useMemo<CodeViewOptions<undefined>>(
    () => ({
      theme: resolveDiffThemes(editorThemeId),
      themeType,
      diffStyle,
      lineDiffType: 'word-alt',
      stickyHeaders: true,
    }),
    [editorThemeId, themeType, diffStyle],
  );

  // Mounted once per changeset — callers key this component on the revision
  // pair, so this effect only runs for a new changeset.
  useEffect(() => {
    let cancelled = false;

    function readAtRev(entry: DiffChangesetFile, rev: string, path: string): Promise<string> {
      if (rev !== WORKING_TREE_REV) return readFileAtRev(workspaceId, rev, path);
      if (entry.diskPath === null) {
        return Promise.reject(new Error(`${entry.path} is outside this workspace`));
      }
      return readWorkingTreeFile(workspaceId, entry.diskPath);
    }

    // Null means a side could not be read — reported, never rendered as an
    // empty file, which would show the whole file as deleted or added.
    async function loadFile(entry: DiffChangesetFile): Promise<CodeViewItem | null> {
      const oldPath = entry.oldPath ?? entry.path;
      let oldContents: string;
      let newContents: string;
      try {
        [oldContents, newContents] = await Promise.all([
          entry.added ? '' : readAtRev(entry, fromRev, oldPath),
          entry.deleted ? '' : readAtRev(entry, toRev, entry.path),
        ]);
      } catch {
        return null;
      }
      try {
        return {
          id: entry.path,
          type: 'diff',
          fileDiff: parseDiffFromFile(
            { name: oldPath, contents: oldContents },
            { name: entry.path, contents: newContents },
          ),
        };
      } catch {
        // Pairs the diff parser rejects (e.g. identical contents on a pure
        // rename) fall back to rendering the file contents directly.
        return {
          id: entry.path,
          type: 'file',
          file: { name: entry.path, contents: newContents || oldContents },
        };
      }
    }

    setUnreadable([]);
    (async () => {
      for (let i = 0; i < files.length; i += LOAD_BATCH_SIZE) {
        const batch = files.slice(i, i + LOAD_BATCH_SIZE);
        const loaded = await Promise.all(batch.map(loadFile));
        if (cancelled) return;

        const items = loaded.filter((item): item is CodeViewItem => item !== null);
        if (items.length > 0) codeViewRef.current?.addItems(items);

        const failed = batch.filter((_, index) => loaded[index] === null).map((f) => f.path);
        if (failed.length > 0) setUnreadable((current) => [...current, ...failed]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, fromRev, toRev, files]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {unreadable.length > 0 && (
        <p className="shrink-0 px-3 py-2 text-xs text-[var(--status-warning)]">
          {unreadable.length === 1
            ? `Couldn't read ${unreadable[0]} to compare it.`
            : `Couldn't read ${unreadable.length} files to compare them.`}
        </p>
      )}
      <CodeView
        ref={codeViewRef}
        className="diff-changeset min-h-0 flex-1 overflow-auto"
        options={options}
      />
    </div>
  );
}
