/**
 * The conflict resolver — what the right-hand pane becomes while a merge is
 * stopped (§7).
 *
 * Parsing, rendering and the resolution engine are `@pierre/diffs`'
 * `UnresolvedFile` as shipped: inline unified, current/incoming vocabulary,
 * regions and markers coloured for you. **The accept buttons are ours**, and
 * that is not a preference. The React wrapper drops the library's resolve
 * callback and keeps the result in its own state, so the built-in action row
 * writes nothing and notifies no one; passing `renderMergeConflictUtility` is
 * the only way to hear about a resolution, and doing so disables that row
 * (§9.1). Sero has to persist, so it draws them.
 *
 * Resolving is therefore: ask the instance for the resolved contents, write
 * them to disk, re-read, and once no markers are left stage the file — which
 * is git's own definition of resolved.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { UnresolvedFile } from '@pierre/diffs/react';
import type { MergeConflictResolution, UnresolvedFile as UnresolvedFileInstance } from '@pierre/diffs';
import { Loader2 } from 'lucide-react';
import { countConflicts } from '../../lib/conflict-markers';
import { readWorkingTreeFile, writeWorkingTreeFile } from '../../lib/sero-vcs';
import { resolveDiffThemes } from './diff-themes';
import './diff-view.css';

const RESOLUTIONS: { value: MergeConflictResolution; label: string }[] = [
  { value: 'current', label: 'Accept current change' },
  { value: 'incoming', label: 'Accept incoming change' },
  { value: 'both', label: 'Accept both' },
];

interface Props {
  workspaceId: string;
  /** Repo-relative path — what git is told about. */
  path: string;
  /** Workspace-relative path, or null when the file lies outside the workspace. */
  diskPath: string | null;
  editorThemeId: string;
  themeType: 'light' | 'dark';
  /** Called when the file has no markers left, so it can be staged. */
  onResolved: (path: string) => void;
}

export function ConflictPane({
  workspaceId, path, diskPath, editorThemeId, themeType, onResolved,
}: Props) {
  const [contents, setContents] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every write. The React wrapper parses once in a lazy state
  // initialiser and never re-parses a changed `file` prop, so a new key is the
  // only way to show what we just wrote (§9.1).
  const [revision, setRevision] = useState(0);
  const instanceRef = useRef<UnresolvedFileInstance<undefined> | null>(null);

  useEffect(() => {
    if (diskPath === null) {
      setError(`${path} is outside this workspace, so it cannot be resolved here.`);
      return;
    }
    let cancelled = false;
    setContents(null);
    setError(null);
    readWorkingTreeFile(workspaceId, diskPath)
      .then((text) => { if (!cancelled) setContents(text); })
      .catch((cause: unknown) => {
        if (!cancelled) setError(messageOf(cause, `Could not read ${path}`));
      });
    return () => { cancelled = true; };
  }, [workspaceId, diskPath, path]);

  const persist = useCallback(async (next: string) => {
    if (diskPath === null) return;
    try {
      await writeWorkingTreeFile(workspaceId, diskPath, next);
      setContents(next);
      setRevision((value) => value + 1);
      setError(null);
      if (countConflicts(next) === 0) onResolved(path);
    } catch (cause) {
      setError(messageOf(cause, `Could not write ${path}`));
    }
  }, [diskPath, onResolved, path, workspaceId]);

  /**
   * A file with a dozen identical conflicts is why this exists — a loop over
   * the same `resolveConflict`, not a library feature. Resolving renumbers what
   * is left, so it always takes the first one still there.
   */
  const acceptAll = useCallback((resolution: MergeConflictResolution, count: number) => {
    const instance = instanceRef.current;
    if (!instance) return;
    let latest: string | null = null;
    for (let i = 0; i < count; i++) {
      const result = instance.resolveConflict(0, resolution);
      if (!result) break;
      latest = result.file.contents;
    }
    if (latest !== null) void persist(latest);
  }, [persist]);

  if (error) return <Message tone="error">{error}</Message>;
  if (contents === null) return <Message>Reading {path}…</Message>;

  const remaining = countConflicts(contents);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3">
        <span className="truncate text-xs text-[var(--text-primary)] git-mono">{path}</span>
        <span className="shrink-0 text-xs text-[var(--text-muted)]">
          {remaining === 0 ? 'resolved' : `${remaining} conflict${remaining === 1 ? '' : 's'}`}
        </span>
        <span className="flex-1" />
        {/* Worth having only where the per-conflict row would be repetitive. */}
        {remaining > 1 && (
          <>
            <SmallButton onClick={() => acceptAll('current', remaining)}>
              Accept all current
            </SmallButton>
            <SmallButton onClick={() => acceptAll('incoming', remaining)}>
              Accept all incoming
            </SmallButton>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <UnresolvedFile<undefined>
          key={`${path}:${revision}`}
          file={{ name: path, contents, cacheKey: `${path}:${revision}` }}
          options={{
            theme: resolveDiffThemes(editorThemeId),
            themeType,
            // The instance is handed out here and in the utility renderer only;
            // holding it is what makes "accept all" possible.
            onPostRender: (_node, instance) => { instanceRef.current = instance; },
          }}
          renderMergeConflictUtility={(action, getInstance) => (
            <div className="flex items-center gap-1.5 px-3 py-1">
              {RESOLUTIONS.map(({ value, label }) => (
                <SmallButton
                  key={value}
                  onClick={() => {
                    const result = getInstance()?.resolveConflict(action.conflictIndex, value);
                    if (result) void persist(result.file.contents);
                  }}
                >
                  {label}
                </SmallButton>
              ))}
            </div>
          )}
        />
      </div>
    </div>
  );
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function SmallButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
    >
      {children}
    </button>
  );
}

function Message({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <p className={`max-w-xs text-xs ${tone === 'error' ? 'text-[var(--status-error)]' : 'text-[var(--text-muted)]'}`}>
        {!tone && <Loader2 className="mr-1.5 inline size-3 animate-spin" />}
        {children}
      </p>
    </div>
  );
}
