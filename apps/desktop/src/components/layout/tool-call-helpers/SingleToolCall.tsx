import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { ChatToolCallMessage } from '@/types/ipc';
import {
  ToolCallProgress,
  buildToolProgressModel,
  getEffectiveToolName,
} from '../ToolCallProgress';
import {
  deriveGroupStatus,
  getCollapsedToolSummary,
  toolStatusDot,
} from '../ToolCallState';
import { ToolDetailBody } from './ToolDetailBody';
import { ToolImages } from './ToolImages';
import { ToolFileLinks } from './ToolFileLinks';
import { ToolSummaryText } from './ToolSummaryText';

export function SingleToolCall({
  tool,
  workspaceId,
}: {
  tool: ChatToolCallMessage;
  workspaceId: string | null;
}) {
  const status = deriveGroupStatus([tool]);
  const isRunning = status === 'running';
  const hasFileLinks = Array.isArray(tool.details?.imagePaths) && tool.details.imagePaths.length > 0;
  const progressModel = buildToolProgressModel(tool);
  const isStreamingInput = !!tool.isStreamingInput;
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const expanded = manualExpanded ?? (isRunning || isStreamingInput);

  const summary = useMemo(() => getCollapsedToolSummary(tool), [tool]);
  const effectiveToolName = useMemo(() => getEffectiveToolName(tool), [tool]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group/tg overflow-hidden rounded-lg border transition-colors duration-200',
        isRunning || isStreamingInput
          ? 'border-status-info-border bg-status-info-faint'
          : status === 'error'
            ? 'border-status-error-border bg-status-error-faint'
            : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50',
      )}
    >
      <button type="button"
        onClick={() => setManualExpanded(!expanded)}
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150',
          'hover:bg-[var(--bg-elevated)]/80',
        )}
      >
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <ChevronRight className="size-3.5 text-[var(--text-muted)]" />
        </motion.div>

        {toolStatusDot(tool.state)}
        <span className="shrink-0 text-sm font-medium text-[var(--text-secondary)]">
          {effectiveToolName}
        </span>
        {summary ? (
          <ToolSummaryText
            summary={summary}
            toolName={tool.toolName}
            workspaceId={workspaceId}
            hasLiveProgress={!!progressModel}
          />
        ) : null}
        {progressModel || isStreamingInput ? (
          <span className="rounded-full bg-status-info-subtle px-1.5 py-0.5 text-sm font-medium uppercase tracking-wide text-status-info">
            Live
          </span>
        ) : null}
        {tool.state === 'cancelled' ? (
          <span className="ml-auto shrink-0 text-sm text-status-warning">cancelled</span>
        ) : null}
      </button>

      {!expanded && progressModel ? (
        <div className="border-t border-[var(--border-subtle)] p-3">
          <ToolCallProgress tool={tool} />
        </div>
      ) : null}

      {tool.images?.length && !expanded ? (
        <div className="border-t border-[var(--border-subtle)] px-3 py-2">
          <ToolImages images={tool.images} workspaceId={workspaceId} />
        </div>
      ) : null}

      {hasFileLinks && !expanded ? (
        <div className="border-t border-[var(--border-subtle)]">
          <ToolFileLinks details={tool.details} workspaceId={workspaceId} />
        </div>
      ) : null}

      <AnimatePresence>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border-subtle)] px-3 py-2.5">
              <ToolDetailBody tool={tool} workspaceId={workspaceId} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
