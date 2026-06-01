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
import { ToolDetail } from './ToolDetail';
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
  const isComplete = tool.state === 'completed' || tool.state === 'error';
  const isCancelled = tool.state === 'cancelled';
  const hasImages = !!tool.images?.length;
  const hasFileLinks = Array.isArray(tool.details?.imagePaths) && tool.details.imagePaths.length > 0;
  const progressModel = buildToolProgressModel(tool);
  const [expanded, setExpanded] = useState(() => isRunning);
  const [showDetails, setShowDetails] = useState(false);

  const summary = useMemo(() => getCollapsedToolSummary(tool), [tool]);
  const effectiveToolName = useMemo(() => getEffectiveToolName(tool), [tool]);
  const hasSummaryContent = !!progressModel || (isComplete && (hasImages || hasFileLinks)) || isCancelled;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group/tg overflow-hidden rounded-lg border transition-colors duration-200',
        isRunning
          ? 'border-[var(--status-info-border)] bg-[var(--status-info-faint)]'
          : status === 'error'
            ? 'border-[var(--status-error-border)] bg-[var(--status-error-faint)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50',
      )}
    >
      <button type="button"
        onClick={() => setExpanded((previous) => !previous)}
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
        <span className="shrink-0 text-[11px] font-medium text-[var(--text-secondary)]">
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
        {progressModel ? (
          <span className="rounded-full bg-[var(--status-info-subtle)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--status-info)]">
            Live
          </span>
        ) : null}
      </button>

      {!expanded && progressModel ? (
        <div className="border-t border-[var(--border-subtle)] p-3">
          <ToolCallProgress tool={tool} />
        </div>
      ) : null}

      {hasImages && !expanded ? (
        <div className="border-t border-[var(--border-subtle)] px-3 py-2">
          <ToolImages images={tool.images!} workspaceId={workspaceId} />
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
            <div className="border-t border-[var(--border-subtle)]">
              {!showDetails ? (
                <>
                  {hasSummaryContent ? (
                    <div className="space-y-4 p-3">
                      {progressModel ? <ToolCallProgress tool={tool} /> : null}
                      {!progressModel && isComplete && hasImages ? (
                        <ToolImages images={tool.images!} workspaceId={workspaceId} />
                      ) : null}
                      {!progressModel && isComplete ? (
                        <ToolFileLinks details={tool.details} workspaceId={workspaceId} />
                      ) : null}
                      {isCancelled ? (
                        <div className="text-xs italic text-[var(--status-warning)]">
                          Cancelled — agent was stopped before this tool completed.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div
                    className={cn(
                      'px-3 py-1.5',
                      hasSummaryContent && 'border-t border-[var(--border-subtle)]/60',
                    )}
                  >
                    <button type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowDetails(true);
                      }}
                      className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                    >
                      Show full details
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-0 p-2">
                    <ToolDetail tool={tool} workspaceId={workspaceId} />
                  </div>
                  <div className="border-t border-[var(--border-subtle)]/60 px-3 py-1.5">
                    <button type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowDetails(false);
                      }}
                      className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                    >
                      Collapse details
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
