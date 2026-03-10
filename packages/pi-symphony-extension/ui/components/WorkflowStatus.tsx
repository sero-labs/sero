/**
 * WorkflowStatus — current WORKFLOW.md config summary + validation.
 */

import type { SymphonyState } from '../../shared/types';

interface WorkflowStatusProps {
  state: SymphonyState;
}

export function WorkflowStatus({ state }: WorkflowStatusProps) {
  if (!state.workflowPath) return null;

  return (
    <div className="sy-card px-4 py-3">
      <h2 className="mb-2 text-sm font-medium" style={{ color: 'var(--sy-text)' }}>
        Workflow
      </h2>
      <div className="flex flex-col gap-1 text-xs" style={{ color: 'var(--sy-muted)' }}>
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: state.workflowValid ? 'var(--sy-success)' : 'var(--sy-danger)',
            }}
          />
          <span style={{ color: 'var(--sy-text)' }}>
            {state.workflowValid ? 'Valid' : 'Invalid'}
          </span>
        </div>

        {state.workflowError && (
          <div className="mt-1 rounded-md px-2 py-1.5" style={{ background: 'rgba(248, 113, 113, 0.08)', color: 'var(--sy-danger)' }}>
            {state.workflowError}
          </div>
        )}

        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {state.trackerKind && (
            <span>Tracker: <span style={{ color: 'var(--sy-text)' }}>{state.trackerKind}</span></span>
          )}
          <span>Max agents: <span style={{ color: 'var(--sy-text)' }}>{state.maxConcurrentAgents}</span></span>
          <span>Poll interval: <span style={{ color: 'var(--sy-text)' }}>{(state.pollIntervalMs / 1000).toFixed(0)}s</span></span>
        </div>
      </div>
    </div>
  );
}
