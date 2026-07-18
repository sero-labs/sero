/**
 * DiffChangeset — whole-changeset diff viewer built on @pierre/diffs CodeView.
 *
 * Loads each file's old/new contents over IPC in small batches and appends
 * them to the CodeView as they arrive, so the first files paint while the
 * rest of a large changeset is still loading.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { parseDiffFromFile } from '@pierre/diffs';
import type { CodeViewItem, CodeViewOptions } from '@pierre/diffs';
import { CodeView, type CodeViewHandle } from '@pierre/diffs/react';
import type { FileDiffEntry } from '@sero-ai/common';
import { WORKING_TREE_REV } from '@sero-ai/common';
import { resolveDiffThemes } from './diff-themes';
import './diff-view.css';

/** Files fetched per batch — bounds concurrent IPC/VCS calls. */
const LOAD_BATCH_SIZE = 8;

export type DiffStyle = 'split' | 'unified';

export interface DiffChangesetHandle {
  scrollToFile(path: string): void;
}

interface Props {
  workspaceId: string;
  fromRev: string;
  toRev: string;
  files: FileDiffEntry[];
  diffStyle: DiffStyle;
  editorThemeId: string;
  themeType: 'light' | 'dark';
  /** Scroll to this file once its diff has been added. */
  initialPath?: string;
}

export const DiffChangeset = forwardRef<DiffChangesetHandle, Props>(
  function DiffChangeset(
    { workspaceId, fromRev, toRev, files, diffStyle, editorThemeId, themeType, initialPath },
    ref,
  ) {
    const codeViewRef = useRef<CodeViewHandle<undefined>>(null);
    const pendingScrollRef = useRef<string | null>(initialPath ?? null);

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

    useImperativeHandle(
      ref,
      () => ({
        scrollToFile(path: string) {
          codeViewRef.current?.scrollTo({ type: 'item', id: path, align: 'start' });
        },
      }),
      [],
    );

    // Mounted once per changeset — DiffTab keys this component on
    // workspaceId/fromRev/toRev, so this effect only runs for a new changeset.
    useEffect(() => {
      let cancelled = false;

      function readAtRev(rev: string, path: string): Promise<string> {
        return rev === WORKING_TREE_REV
          ? window.sero.editor.readFile(workspaceId, path).catch(() => '')
          : window.sero.vcs.fileContent(workspaceId, rev, path).catch(() => '');
      }

      async function loadFile(entry: FileDiffEntry): Promise<CodeViewItem> {
        const oldPath = entry.oldPath ?? entry.path;
        const [oldContents, newContents] = await Promise.all([
          entry.status === 'added' ? '' : readAtRev(fromRev, oldPath),
          entry.status === 'deleted' ? '' : readAtRev(toRev, entry.path),
        ]);
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

      (async () => {
        for (let i = 0; i < files.length; i += LOAD_BATCH_SIZE) {
          const batch = files.slice(i, i + LOAD_BATCH_SIZE);
          const items = await Promise.all(batch.map(loadFile));
          if (cancelled) return;
          codeViewRef.current?.addItems(items);

          const target = pendingScrollRef.current;
          if (target != null && batch.some((entry) => entry.path === target)) {
            pendingScrollRef.current = null;
            codeViewRef.current?.scrollTo({ type: 'item', id: target, align: 'start' });
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [workspaceId, fromRev, toRev, files]);

    return (
      <CodeView
        ref={codeViewRef}
        className="diff-changeset h-full overflow-auto"
        options={options}
      />
    );
  },
);
