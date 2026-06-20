import { Button } from '@sero-ai/ui';

import type { LoopGoal, LoopStatus } from '../../shared/types';
import type { OrchestratorActions } from '../lib/actions';
import '../styles.css';

const RUNNABLE: ReadonlySet<LoopStatus> = new Set<LoopStatus>(['active', 'blocked']);
const PAUSABLE: ReadonlySet<LoopStatus> = new Set<LoopStatus>(['draft', 'active', 'blocked']);
const RESUMABLE: ReadonlySet<LoopStatus> = new Set<LoopStatus>(['paused', 'blocked']);
const STOPPABLE: ReadonlySet<LoopStatus> = new Set<LoopStatus>([
  'draft',
  'active',
  'paused',
  'blocked',
]);

interface LoopControlsProps {
  loop: LoopGoal;
  actions: OrchestratorActions;
}

export function LoopControls({ loop, actions }: LoopControlsProps) {
  const { busy } = actions;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        disabled={busy || !RUNNABLE.has(loop.status)}
        onClick={() => actions.runNext(loop.id)}
      >
        Run next
      </Button>
      {RESUMABLE.has(loop.status) ? (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => actions.resume(loop.id)}
        >
          Resume
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !PAUSABLE.has(loop.status)}
          onClick={() => actions.pause(loop.id)}
        >
          Pause
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={busy || !STOPPABLE.has(loop.status)}
        onClick={() => actions.stop(loop.id)}
      >
        Stop
      </Button>
    </div>
  );
}

export default LoopControls;
