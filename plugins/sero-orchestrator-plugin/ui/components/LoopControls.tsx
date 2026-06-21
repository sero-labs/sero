import { Button } from '@sero-ai/ui';
import { Pause, Play, Square, StepForward, Zap } from 'lucide-react';
import type { Loop, OrchestratorAction } from '../../shared/types';

interface LoopControlsProps {
  loop: Loop;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
}

/** Lifecycle controls. Each button maps to exactly one coordinator action. */
export function LoopControls({ loop, busy, onAction }: LoopControlsProps) {
  const { id, status } = loop;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'draft' && (
        <Button size="sm" disabled={busy} onClick={() => onAction({ kind: 'activate', loopId: id })}>
          <Zap className="mr-1 h-3.5 w-3.5" /> Activate
        </Button>
      )}
      {status === 'active' && (
        <>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction({ kind: 'run_next', loopId: id })}>
            <StepForward className="mr-1 h-3.5 w-3.5" /> Run next
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction({ kind: 'pause', loopId: id })}>
            <Pause className="mr-1 h-3.5 w-3.5" /> Pause
          </Button>
        </>
      )}
      {(status === 'paused' || status === 'blocked') && (
        <Button size="sm" disabled={busy} onClick={() => onAction({ kind: 'resume', loopId: id })}>
          <Play className="mr-1 h-3.5 w-3.5" /> Resume
        </Button>
      )}
      {status !== 'complete' && status !== 'stopped' && (
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => onAction({ kind: 'stop', loopId: id })}>
          <Square className="mr-1 h-3.5 w-3.5" /> Stop
        </Button>
      )}
    </div>
  );
}
