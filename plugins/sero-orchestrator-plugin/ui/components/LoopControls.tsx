import { useState } from 'react';
import { Button, Checkbox, Label } from '@sero-ai/ui';
import { Power, PowerOff, RefreshCw, RotateCcw, StepForward, Trash2, Zap } from 'lucide-react';
import type { Loop, OrchestratorAction } from '../../shared/types';
import { isRetryableLoop } from '../../shared/recovery';

interface LoopControlsProps {
  loop: Loop;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
}

/** Lifecycle controls. Each button maps to exactly one coordinator action. */
export function LoopControls({ loop, busy, onAction }: LoopControlsProps) {
  const { id, status } = loop;
  // Retry is offered whenever the loop has something to recover (a blocked/failed
  // step, a runtime block, or a blocked completion) and no run is in flight.
  const canRetry = !loop.runtime.activeRunId && isRetryableLoop(loop);
  // Keyed by loop id so switching loops mid-confirm never targets the wrong one.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteBranch, setDeleteBranch] = useState(false);
  const confirmingDelete = confirmDeleteId === id;
  // A branch only exists if this loop resolved a managed worktree.
  const hasBranch = loop.runtime.workspace.resolved?.type === 'managed-worktree';

  const startDelete = () => {
    setDeleteBranch(false);
    setConfirmDeleteId(id);
  };
  const cancelDelete = () => {
    setDeleteBranch(false);
    setConfirmDeleteId(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'draft' && (
        <Button size="sm" disabled={busy} onClick={() => onAction({ kind: 'activate', loopId: id })}>
          <Zap className="mr-1 h-3.5 w-3.5" /> Activate
        </Button>
      )}
      {status === 'active' && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction({ kind: 'run_next', loopId: id })}>
          <StepForward className="mr-1 h-3.5 w-3.5" /> Run next
        </Button>
      )}
      {(status === 'disabled' || status === 'blocked') && (
        <Button size="sm" disabled={busy} onClick={() => onAction({ kind: 'enable', loopId: id })}>
          <Power className="mr-1 h-3.5 w-3.5" /> Enable
        </Button>
      )}
      {status === 'complete' && (
        <Button size="sm" disabled={busy} onClick={() => onAction({ kind: 'run_again', loopId: id })}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Run again
        </Button>
      )}
      {canRetry && (
        <Button size="sm" disabled={busy} onClick={() => onAction({ kind: 'retry', loopId: id })}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry
        </Button>
      )}
      {(status === 'active' || status === 'blocked') && (
        // Not gated by `busy`: Disable is the interrupt — it must work WHILE a
        // run is in flight (which is exactly when `busy` is true), since that is
        // when the user needs to kill the active subagents.
        <Button size="sm" variant="outline" onClick={() => onAction({ kind: 'disable', loopId: id })}>
          <PowerOff className="mr-1 h-3.5 w-3.5" /> Disable
        </Button>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {confirmingDelete ? (
          <>
            <span className="text-xs text-muted-foreground">Delete this loop and its config?</span>
            {hasBranch && (
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id={`delete-branch-${id}`}
                  checked={deleteBranch}
                  disabled={busy}
                  onCheckedChange={(checked) => setDeleteBranch(checked === true)}
                />
                <Label htmlFor={`delete-branch-${id}`} className="text-xs font-normal text-muted-foreground">
                  Also delete the git branch
                </Label>
              </div>
            )}
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => onAction({ kind: 'delete', loopId: id, deleteBranch })}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Confirm delete
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={cancelDelete}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" disabled={busy} onClick={startDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}
