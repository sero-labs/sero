import { useEffect, useMemo, useState } from 'react';
import { Clock3, RotateCcw, GitBranch, RefreshCw, PlusCircle } from 'lucide-react';

import { useWorkspaceVcs, useVcsStore } from '@/stores/vcs';
import type { VcsCheckpoint } from '@/types/vcs';
import { Button } from '@/components/ui/button';

interface VcsPanelProps {
  workspaceId: string;
}

function formatCheckpoint(cp: VcsCheckpoint): string {
  return `${cp.changeId}  ${cp.description}`;
}

export function VcsPanel({ workspaceId }: VcsPanelProps) {
  const state = useWorkspaceVcs(workspaceId);
  const loadWorkspace = useVcsStore((s) => s.loadWorkspace);
  const createCheckpoint = useVcsStore((s) => s.createCheckpoint);
  const restoreCheckpoint = useVcsStore((s) => s.restoreCheckpoint);
  const fetchDiff = useVcsStore((s) => s.fetchDiff);

  const [description, setDescription] = useState('');
  const [compareBase, setCompareBase] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspace(workspaceId);
  }, [workspaceId, loadWorkspace]);

  const checkpoints = state?.checkpoints ?? [];
  const lastDiff = state?.lastDiff ?? null;

  const currentSummary = useMemo(() => {
    if (!state) return 'No workspace selected';
    if (!state.currentChangeId) return 'No active JJ change';
    return `${state.currentChangeId}${state.hasWorkingCopyChanges ? ' • unsnapshotted changes' : ''}`;
  }, [state]);

  const onCreate = async () => {
    await createCheckpoint(workspaceId, description || undefined, 'manual');
    setDescription('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2 pb-2">
      <div className="flex items-center gap-2 px-2 py-2 text-xs text-[var(--text-muted)]">
        <GitBranch className="size-3.5" />
        <span className="truncate">{currentSummary}</span>
      </div>

      <div className="px-2 pb-2">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Checkpoint description (optional)"
          className="h-8 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 text-xs text-[var(--text-primary)] outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onCreate}>
            <PlusCircle className="mr-1 size-3.5" />
            Checkpoint
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void loadWorkspace(workspaceId)}>
            <RefreshCw className="mr-1 size-3.5" />
            Refresh
          </Button>
        </div>
        {compareBase && (
          <div className="mt-2 text-[11px] text-[var(--text-muted)]">
            Compare base: <span className="font-mono">{compareBase}</span>
          </div>
        )}
      </div>

      {state?.error && (
        <div className="mx-2 mb-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-400">
          {state.error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        {state?.isLoading && checkpoints.length === 0 ? (
          <div className="px-2 py-3 text-xs text-[var(--text-muted)]">Loading checkpoints…</div>
        ) : checkpoints.length === 0 ? (
          <div className="px-2 py-3 text-xs text-[var(--text-muted)]">No checkpoints yet.</div>
        ) : (
          <div className="space-y-1">
            {checkpoints.map((cp) => (
              <div
                key={cp.changeId}
                className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2"
              >
                <div className="line-clamp-2 text-xs text-[var(--text-primary)]">{formatCheckpoint(cp)}</div>
                <div className="mt-2 flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void fetchDiff(
                        workspaceId,
                        compareBase && compareBase !== cp.changeId ? compareBase : cp.changeId,
                        compareBase && compareBase !== cp.changeId ? cp.changeId : undefined,
                      )
                    }
                  >
                    <Clock3 className="mr-1 size-3" />
                    {compareBase && compareBase !== cp.changeId ? 'Compare' : 'Diff'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void restoreCheckpoint(workspaceId, cp.changeId)}
                  >
                    <RotateCcw className="mr-1 size-3" />
                    Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCompareBase((prev) => (prev === cp.changeId ? null : cp.changeId))}
                  >
                    <GitBranch className="mr-1 size-3" />
                    {compareBase === cp.changeId ? 'Base set' : 'Set base'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {lastDiff && (
        <div className="mt-2 min-h-0 max-h-56 overflow-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2">
          <pre className="whitespace-pre-wrap text-[11px] text-[var(--text-secondary)]">{lastDiff}</pre>
        </div>
      )}
    </div>
  );
}
