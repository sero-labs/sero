import type { ReactNode } from 'react';
import { Lock, Wrench } from 'lucide-react';
import type { ContextToolInfo } from '@sero-ai/common';
import { Button, Checkbox, Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui';
import { cn } from '@sero-ai/ui/lib/utils';
import type { LoopStepDefinition } from '../../shared/types';
import { LEAN_TOOL_BASELINE, isBaselineTool } from '../../shared/constants';

interface StepToolsControlProps {
  step: LoopStepDefinition;
  catalog: ContextToolInfo[];
  onChange: (tools?: string[]) => void;
}

function currentExtras(step: LoopStepDefinition): string[] {
  const tools = step.execution.type === 'background-agent' ? step.execution.tools : undefined;
  return (tools ?? []).filter((name) => !isBaselineTool(name));
}

/**
 * Per-step tool selector. The lean coding baseline is always on and locked; the
 * planner picks extra tools per step and the user can add/remove those extras.
 * The trigger summarizes the selection; the popover separates the locked baseline
 * from the optional catalog tools.
 */
export function StepToolsControl({ step, catalog, onChange }: StepToolsControlProps) {
  const extras = new Set(currentExtras(step));
  const baselineItems: ContextToolInfo[] = LEAN_TOOL_BASELINE.map(
    (name) => catalog.find((t) => t.name === name) ?? { name },
  );
  const optionalItems = catalog.filter((tool) => !isBaselineTool(tool.name));

  const toggle = (name: string) => {
    const next = new Set(extras);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next.size > 0 ? [...next] : undefined);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Tools</span>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label={`Tools for ${step.title}`} className={triggerClass}>
            <Wrench className="h-3 w-3" />
            {extras.size > 0 ? `Baseline + ${extras.size}` : 'Lean baseline'}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-medium">Step tools</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={extras.size === 0}
              onClick={() => onChange(undefined)}
            >
              Clear extras
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            <GroupLabel>Always included</GroupLabel>
            {baselineItems.map((tool) => (
              <ToolRow key={tool.name} tool={tool} checked disabled locked />
            ))}
            {optionalItems.length > 0 && <GroupLabel>Add as needed</GroupLabel>}
            {optionalItems.map((tool) => (
              <ToolRow
                key={tool.name}
                tool={tool}
                checked={extras.has(tool.name)}
                onToggle={() => toggle(tool.name)}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{children}</div>;
}

function ToolRow({
  tool,
  checked,
  disabled,
  locked,
  onToggle,
}: {
  tool: ContextToolInfo;
  checked: boolean;
  disabled?: boolean;
  locked?: boolean;
  onToggle?: () => void;
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-2 rounded-md px-2 py-1.5',
        disabled ? 'opacity-70' : 'cursor-pointer hover:bg-accent',
      )}
      title={tool.description}
    >
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={onToggle} className="mt-0.5" />
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-xs font-medium">
          {tool.name}
          {locked && <Lock className="h-2.5 w-2.5 text-muted-foreground" />}
        </span>
        {tool.description && (
          <span className="block truncate text-[11px] text-muted-foreground">{tool.description}</span>
        )}
      </span>
    </label>
  );
}

const triggerClass = cn(
  'inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring hover:bg-accent',
);
