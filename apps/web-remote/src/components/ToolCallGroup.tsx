/**
 * Tool call group — copies the desktop `ToolCallGroup` shell: a rounded
 * bordered card with a summary row, an info-token border while the group
 * is live, and the tool rows inside.
 *
 * The desktop's rail/split layout is not ported. List mode only.
 */

import { memo, useRef, useState } from 'react';
import { ChevronRight, Loader2, CheckCircle2, AlertCircle, WrenchIcon } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { ToolCall } from '@/stores/chat';
import {
  deriveGroupStatus,
  groupStatusLabel,
  type GroupStatus,
} from '@/lib/tool-call-state';
import { ToolCallItem } from './ToolCallItem';

/** Only the most recent calls are drawn; older ones stay in the session. */
const VISIBLE_TOOL_LIMIT = 10;

function statusIcon(status: GroupStatus) {
  switch (status) {
    case 'running':
      return <Loader2 className="size-3.5 animate-spin text-status-info" />;
    case 'completed':
      return <CheckCircle2 className="size-3.5 text-status-success" />;
    case 'error':
      // The group finished even if one attempt failed. Failures stay
      // visible on their own rows without marking the whole turn broken.
      return <CheckCircle2 className="size-3.5 text-[var(--text-muted)]" />;
    case 'cancelled':
      return <AlertCircle className="size-3.5 text-status-warning" />;
  }
}

export const ToolCallGroup = memo(function ToolCallGroup({
  toolCalls,
}: {
  toolCalls: ToolCall[];
}) {
  const status = deriveGroupStatus(toolCalls);
  const isRunning = status === 'running';

  // A group that ran in front of the reader stays open until it settles.
  // A group loaded from history opens only when asked.
  const wasEverRunning = useRef(isRunning);
  if (isRunning) wasEverRunning.current = true;

  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const expanded = manualExpanded ?? (wasEverRunning.current && isRunning);

  if (toolCalls.length === 0) return null;

  const visible = toolCalls.slice(-VISIBLE_TOOL_LIMIT);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border transition-colors duration-200',
        isRunning
          ? 'border-status-info-border bg-status-info-faint'
          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50',
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setManualExpanded(!expanded)}
        className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150 hover:bg-[var(--bg-elevated)]/80"
      >
        <ChevronRight
          className={cn(
            'size-3.5 text-[var(--text-muted)] transition-transform duration-200',
            expanded && 'rotate-90',
          )}
        />
        <WrenchIcon className="size-3.5 text-[var(--text-muted)]" />
        {statusIcon(status)}
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          {groupStatusLabel(status, toolCalls.length)}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border-subtle)]">
          {visible.map((tool) => (
            <ToolCallItem key={tool.renderKey ?? tool.toolCallId} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
});
