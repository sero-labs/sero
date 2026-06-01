/**
 * AgentList, scrollable list of agent cards in the left panel.
 */

import { cn } from '@sero-ai/ui/lib/utils';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import type { AgentModelConfig, AgentSummary } from './types';

interface AgentListProps {
  agents: AgentSummary[];
  selected: string | null;
  onSelect: (name: string) => void;
}

const THINKING_COLORS: Record<string, string> = {
  off: 'bg-zinc-500/20 text-zinc-400',
  low: 'bg-blue-500/20 text-blue-400',
  medium: 'bg-amber-500/20 text-amber-400',
  high: 'bg-red-500/20 text-red-400',
};

function modelShort(model?: AgentModelConfig): string {
  if (!model) return 'Sero default';

  const value = typeof model === 'string' ? model : model.prefer;
  if (value === 'LOW') return 'Low tier';
  if (value === 'MED') return 'Med tier';
  if (value === 'HIGH') return 'High tier';

  return value.replace(/^claude-/, '').replace(/^[^/]+\//, '');
}

export function AgentList({ agents, selected, onSelect }: AgentListProps) {
  if (agents.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <p className="text-xs text-muted-foreground">No agents found</p>
        <p className="mt-1 text-[10px] text-muted-foreground/60">
          Click + to create one
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {agents.map((agent) => (
        <button type="button"
          key={agent.name}
          onClick={() => onSelect(agent.name)}
          className={cn(
            'flex w-full flex-col gap-0.5 border-b border-border/50 px-3 py-2.5 text-left transition-colors',
            'hover:bg-secondary/50',
            selected === agent.name && 'bg-secondary border-l-2 border-l-primary',
          )}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {agent.name}
            </span>
            {agent.thinking && (
              <Badge
                variant="secondary"
                className={cn(
                  'px-1 py-0 text-[9px] leading-tight',
                  THINKING_COLORS[agent.thinking] ?? '',
                )}
              >
                {agent.thinking}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate leading-snug">
            {agent.description || 'No description'}
          </p>
          <span className="text-[10px] text-muted-foreground/60">
            {modelShort(agent.model)}
          </span>
        </button>
      ))}
    </div>
  );
}
