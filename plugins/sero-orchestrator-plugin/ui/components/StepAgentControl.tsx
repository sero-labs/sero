import type { ContextAgentInfo } from '@sero-ai/common';
import { cn } from '@sero-ai/ui/lib/utils';
import type { LoopStepDefinition } from '../../shared/types';

const DEFAULT = '__default__';

interface StepAgentControlProps {
  step: LoopStepDefinition;
  catalog: ContextAgentInfo[];
  onChange: (agent?: string) => void;
}

function currentAgent(step: LoopStepDefinition): string | undefined {
  return step.execution.type === 'background-agent' ? step.execution.agent : undefined;
}

/**
 * Per-step agent-role selector (background-agent steps only). The planner may
 * assign a role; this lets the user keep it, pick a different one, or revert to
 * the default general agent. A role that no longer exists is still shown (so the
 * user can see and clear it); it falls back to the default at run time.
 */
export function StepAgentControl({ step, catalog, onChange }: StepAgentControlProps) {
  const agent = currentAgent(step);
  const missing = !!agent && !catalog.some((a) => a.name === agent);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Agent</span>
      <select
        aria-label={`Agent for ${step.title}`}
        value={agent ?? DEFAULT}
        onChange={(e) => onChange(e.target.value === DEFAULT ? undefined : e.target.value)}
        className={selectClass}
      >
        <option value={DEFAULT}>Default agent</option>
        {catalog.map((a) => (
          <option key={a.name} value={a.name}>{a.name}</option>
        ))}
        {missing && <option value={agent}>{agent} (unavailable)</option>}
      </select>
    </div>
  );
}

const selectClass = cn(
  'rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
);
