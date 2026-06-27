import { Wrench } from 'lucide-react';
import type { ContextToolInfo } from '@sero-ai/common';
import { Button, Checkbox, Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui';
import { cn } from '@sero-ai/ui/lib/utils';
import type { LoopStepDefinition } from '../../shared/types';
import { LEAN_TOOL_BASELINE } from '../../shared/constants';

interface StepToolsControlProps {
  step: LoopStepDefinition;
  catalog: ContextToolInfo[];
  onChange: (tools?: string[]) => void;
}

function currentTools(step: LoopStepDefinition): string[] | undefined {
  return step.execution.type === 'background-agent' ? step.execution.tools : undefined;
}

/**
 * Per-step tool selector. The planner picks each background-agent step's tools;
 * this lets the user override them. A step with no explicit tools runs on the
 * lean coding baseline (bash/read/write/edit/sero-cli). The trigger summarizes
 * the selection; the popover is the catalog with the step's tools checked.
 */
export function StepToolsControl({ step, catalog, onChange }: StepToolsControlProps) {
  const explicit = currentTools(step);
  const isBaseline = !explicit || explicit.length === 0;
  const selected = new Set(explicit ?? LEAN_TOOL_BASELINE);
  // Show the lean baseline even when the catalog hasn't loaded the names yet.
  const items: ContextToolInfo[] = catalog.length > 0
    ? catalog
    : LEAN_TOOL_BASELINE.map((name) => ({ name }));

  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next.size > 0 ? [...next] : undefined);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Tools</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Tools for ${step.title}`}
            className={triggerClass}
          >
            <Wrench className="h-3 w-3" />
            {isBaseline ? 'Lean baseline' : `${selected.size} selected`}
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
              disabled={isBaseline}
              onClick={() => onChange(undefined)}
            >
              Reset to baseline
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {items.map((tool) => (
              <label
                key={tool.name}
                className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                title={tool.description}
              >
                <Checkbox
                  checked={selected.has(tool.name)}
                  onCheckedChange={() => toggle(tool.name)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium">{tool.name}</span>
                  {tool.description && (
                    <span className="block truncate text-[11px] text-muted-foreground">{tool.description}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const triggerClass = cn(
  'inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring hover:bg-accent',
);
