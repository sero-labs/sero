import { useState } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { ChatToolCallMessage } from '@/types/ipc';
import { looksLikeFilePath } from '../ClickableFilePath';
import { getEffectiveToolName } from '../ToolCallProgress';
import { getCollapsedToolSummary, isToolLive, toolStatusDot } from '../ToolCallState';
import { ToolDetailBody } from './ToolDetailBody';
import { ToolRowHeader } from './ToolRowHeader';

/** The rail is narrow, so a path is cut down to its file name. */
function railSummary(tool: ChatToolCallMessage): string {
  const summary = getCollapsedToolSummary(tool);
  if (!looksLikeFilePath(summary)) return summary;
  return summary.split('/').filter(Boolean).pop() ?? summary;
}

/**
 * Rail layout: the list stays on the left, one detail fills the pane. Suits
 * long groups, where a stack of open rows would bury the sequence.
 */
export function ToolRailPane({
  tools,
  workspaceId,
  onDetailOpen,
}: {
  tools: ChatToolCallMessage[];
  workspaceId: string | null;
  /** Called when the reader picks a step, so the group stops auto-collapsing. */
  onDetailOpen?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Without a choice, follow the work: the newest live tool, else the last one.
  const fallback = [...tools].reverse().find(isToolLive) ?? tools[tools.length - 1];
  const selected = tools.find((tool) => tool.id === selectedId) ?? fallback;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)]">
      <div className="sticky top-0 self-start border-r border-[var(--border-subtle)] py-1">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => {
              onDetailOpen?.();
              setSelectedId(tool.id);
            }}
            className={cn(
              'flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition-colors duration-150',
              tool.id === selected.id
                ? 'bg-[var(--bg-elevated)]/80 shadow-[inset_2px_0_0_var(--accent-primary)]'
                : 'hover:bg-[var(--bg-elevated)]/50',
            )}
          >
            <span className="mt-1.5">{toolStatusDot(tool.state)}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-[var(--text-secondary)]">
                {getEffectiveToolName(tool)}
              </span>
              <span className="block truncate font-mono text-sm text-[var(--text-muted)]">
                {railSummary(tool)}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="min-w-0 px-3 py-2.5">
        <div className="mb-2.5 flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2">
          <ToolRowHeader tool={selected} workspaceId={workspaceId} />
        </div>
        <ToolDetailBody tool={selected} workspaceId={workspaceId} />
      </div>
    </div>
  );
}
