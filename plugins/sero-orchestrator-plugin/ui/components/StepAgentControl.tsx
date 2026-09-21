import type { ContextAgentInfo } from '@sero-ai/common';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sero-ai/ui/components/ui/select';
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
      <Select value={agent ?? DEFAULT} onValueChange={(value) => onChange(value === DEFAULT ? undefined : value)}>
        <SelectTrigger size="sm" aria-label={`Agent for ${step.title}`} className="text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT}>Default agent</SelectItem>
          {catalog.map((a) => (
            <SelectItem key={a.name} value={a.name}>{a.name}</SelectItem>
          ))}
          {missing && agent && <SelectItem value={agent}>{agent} (unavailable)</SelectItem>}
        </SelectContent>
      </Select>
    </div>
  );
}
