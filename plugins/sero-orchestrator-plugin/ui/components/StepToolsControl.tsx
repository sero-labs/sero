import { Lock, Wrench } from 'lucide-react';
import type { ContextToolInfo } from '@sero-ai/common';
import { Button, Checkbox, Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui';
import { cn } from '@sero-ai/ui/lib/utils';
import type { LoopStepDefinition } from '../../shared/types';
import { DEFAULT_TOOLS, isDefaultTool } from '../../shared/constants';

interface StepToolsControlProps {
  step: LoopStepDefinition;
  catalog: ContextToolInfo[];
  onChange: (tools?: string[]) => void;
}

function currentExtras(step: LoopStepDefinition): string[] {
  const tools = step.execution.type === 'background-agent' ? step.execution.tools : undefined;
  return (tools ?? []).filter((name) => !isDefaultTool(name));
}

/**
 * Per-step tool selector. The default tools are always on and locked (shown as a
 * single item); the planner picks extra tools per step and the user can add or
 * remove those extras. The trigger summarizes the selection.
 */
export function StepToolsControl({ step, catalog, onChange }: StepToolsControlProps) {
  const extras = new Set(currentExtras(step));
  const optionalItems = catalog.filter((tool) => !isDefaultTool(tool.name));

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
            {extras.size > 0 ? `Default tools + ${extras.size}` : 'Default tools'}
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
            {/* Default tools collapsed into one locked, always-on item. */}
            <div
              className="flex items-center gap-2 rounded-md px-2 py-1.5 opacity-80"
              title={`Always included: ${DEFAULT_TOOLS.join(', ')}`}
            >
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-xs font-medium">Default tools</span>
                <span className="block text-[11px] text-muted-foreground">'bash', 'read', 'write', 'edit', etc.</span>
              </span>
            </div>

            {optionalItems.length > 0 && (
              <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Add as needed
              </div>
            )}
            {optionalItems.map((tool) => (
              <label
                key={tool.name}
                className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                title={tool.description}
              >
                <Checkbox checked={extras.has(tool.name)} onCheckedChange={() => toggle(tool.name)} className="mt-0.5" />
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
