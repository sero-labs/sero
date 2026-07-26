/**
 * The titlebar popover — quick actions without changing context (§5 of
 * docs/features/git-ux.md).
 *
 * Contributed by the plugin on the host's titlebar slot (`sero.app.titlebar`),
 * so no git UI lives in the host (AD-025). The plugin owns the `Popover` too:
 * `@sero-ai/ui`'s Radix wrappers portal into the container `PluginStyleScope`
 * provides, so the panel stays inside the plugin's style scope.
 *
 * The trigger carries one count, not two, and says nothing at all until the
 * pushed repo cache is this workspace's — a status label for a state with no
 * action is what rule 28 forbids.
 */

import { useCallback, useMemo, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui/components/ui/popover';
import { openSeroApp, useAppInfo, useAppState } from '@sero-ai/app-runtime';

import type { FileChange, GitAppState } from '../../../shared/types';
import { createDefaultGitState, normalizeGitState } from '../../../shared/types';
import { MiddleTruncate } from '../MiddleTruncate';
import { QuickPanel } from './QuickPanel';

export function GitTitleBar() {
  const { workspaceId, workspacePath } = useAppInfo();
  const initialState = useMemo(() => createDefaultGitState(), []);
  const [rawState] = useAppState<GitAppState>(initialState);
  const state = useMemo(() => normalizeGitState(rawState), [rawState]);

  // Keyed by workspace rather than a boolean, so a workspace switch closes the
  // panel without an effect chasing it.
  const [openFor, setOpenFor] = useState<string | null>(null);

  const changes = useMemo(() => uniqueChanges(state.fileChanges), [state.fileChanges]);
  const currentBranch = useMemo(
    () => state.branches.find((branch) => branch.current),
    [state.branches],
  );

  const openGit = useCallback(() => {
    setOpenFor(null);
    void openSeroApp('git');
  }, []);

  const isCurrentWorkspace = Boolean(workspacePath) && state.repoPath === workspacePath;
  if (!isCurrentWorkspace || state.error === 'Not a git repository') return null;

  const branchName = state.currentBranch || currentBranch?.name || 'detached';

  return (
    <Popover
      open={openFor === workspaceId}
      onOpenChange={(next) => setOpenFor(next ? workspaceId : null)}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Git quick actions"
          className="flex h-[26px] max-w-[190px] items-center gap-[7px] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 text-[0.82rem] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
        >
          <GitBranch className="size-3.5 shrink-0 text-[var(--text-muted)]" />
          <MiddleTruncate value={branchName} />
          {/* Counts are plain text, never pills (rule 6). */}
          {changes.length > 0 && (
            <span className="shrink-0 font-mono text-[0.75rem] text-[var(--status-warning)]">
              {changes.length}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[300px] overflow-hidden rounded-[10px] border-[var(--border-default)] bg-[var(--bg-surface)] p-0"
      >
        <QuickPanel
          workspaceId={workspaceId}
          repoName={state.repoName || branchName}
          branchName={branchName}
          ahead={currentBranch?.ahead ?? 0}
          behind={currentBranch?.behind ?? 0}
          hasRemote={state.remotes.length > 0}
          changes={changes}
          onOpenGit={openGit}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The cache lists a file once per staged and unstaged side; the popover commits
 * everything, so it shows one row per path.
 */
function uniqueChanges(fileChanges: FileChange[]): FileChange[] {
  const byPath = new Map<string, FileChange>();
  for (const change of fileChanges) {
    const existing = byPath.get(change.path);
    if (existing && !change.staged) continue;
    byPath.set(change.path, change);
  }
  return Array.from(byPath.values());
}

// The host's federation loader resolves exposed modules by default export.
export default GitTitleBar;
