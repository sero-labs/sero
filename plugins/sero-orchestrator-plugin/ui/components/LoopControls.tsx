import { useState } from 'react';
import { Button, Checkbox, Label } from '@sero-ai/ui';
import { Power, PowerOff, RotateCcw, Sparkles, StepForward, Trash2, Zap } from 'lucide-react';
import type { Loop, OrchestratorAction } from '../../shared/types';

interface LoopControlsProps {
  loop: Loop;
  busy: boolean;
  /** True once the loop has run at least once — reflection needs history to read. */
  canReflect: boolean;
  onAction: (action: OrchestratorAction) => void;
}

/** Lifecycle controls. Each button maps to exactly one coordinator action. */
export function LoopControls({ loop, busy, canReflect, onAction }: LoopControlsProps) {
  const { id, status } = loop;
  // While parked on a human question, nothing can run until it is answered — so
  // Activate / Run next are suppressed (the question card is the action). Per-step
  // Retry lives on the blocked/failed step itself, in the plan view below.
  const awaitingInput = !!loop.runtime.pendingInput;
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
      {status === 'draft' && !awaitingInput && (
        <Button size="sm" disabled={busy} onClick={() => onAction({ kind: 'activate', loopId: id })}>
          <Zap className="mr-1 h-3.5 w-3.5" /> Activate
        </Button>
      )}
      {status === 'active' && (
        <Button size="sm" variant="outline" disabled={busy || awaitingInput} onClick={() => onAction({ kind: 'run_next', loopId: id })}>
          <StepForward className="mr-1 h-3.5 w-3.5" /> Run next
        </Button>
      )}
      {status === 'disabled' && (
        <Button size="sm" disabled={busy} onClick={() => onAction({ kind: 'enable', loopId: id })}>
          <Power className="mr-1 h-3.5 w-3.5" /> Enable
        </Button>
      )}
      {status === 'complete' && (
        <Button size="sm" disabled={busy} onClick={() => onAction({ kind: 'run_again', loopId: id })}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Run again
        </Button>
      )}
      {(status === 'blocked' || status === 'disabled') && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onAction({ kind: 'run_again', loopId: id })}
          title="Restart from the first step (discards this run's progress; any commits or PRs are kept)"
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restart
        </Button>
      )}
      {canReflect && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction({ kind: 'reflect', loopId: id })} title="Learn from past runs and suggest improvements">
          <Sparkles className="mr-1 h-3.5 w-3.5" /> Reflect
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
