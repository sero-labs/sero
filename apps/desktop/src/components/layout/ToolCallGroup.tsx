import { useState, useMemo, useEffect, useRef, memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, WrenchIcon } from 'lucide-react';
import { cn } from '@sero/ui/lib/utils';
import type { ChatMessage, ChatToolCallMessage } from '@/types/ipc';
import {
  deriveGroupStatus,
  groupStatusIcon,
  groupStatusLabel,
  ToolLine,
  ToolDetail,
  SingleToolCall,
} from './ToolCallHelpers';

// ── Types ───────────────────────────────────────────────────────

export type GroupedChatItem =
  | { kind: 'message'; message: ChatMessage }
  | { kind: 'tool-group'; tools: ChatToolCallMessage[]; id: string };

// ── Grouping utility ────────────────────────────────────────────

/**
 * Groups consecutive tool messages into collapsed blocks.
 * Non-empty text messages (user / assistant with content) break the grouping.
 *
 * Empty assistant messages are dropped — they appear between sequential tool
 * calls (the SDK emits one per tool-use block) and would otherwise break
 * grouping and cause expand/collapse flapping.  The only exception is a
 * streaming empty assistant that is the very last message: it is kept so the
 * UI can show a "thinking" spinner.
 */
export function groupMessages(
  messages: ChatMessage[],
): GroupedChatItem[] {
  const result: GroupedChatItem[] = [];
  let toolBuffer: ChatToolCallMessage[] = [];

  const flushTools = () => {
    if (toolBuffer.length === 0) return;
    result.push({
      kind: 'tool-group',
      tools: [...toolBuffer],
      id: `tg-${toolBuffer[0].id}`,
    });
    toolBuffer = [];
  };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.type === 'tool') {
      toolBuffer.push(msg);
      continue;
    }

    // Skip empty assistant messages that have no content at all — they appear
    // between sequential tool calls (SDK emits one per tool-use block).
    // However, keep messages that have thinking content so the ThinkingBlock
    // can render while the model is still reasoning (text is empty but
    // thinking deltas are accumulating).
    if (msg.type === 'assistant' && !msg.text?.trim() && !msg.thinking) {
      continue;
    }

    flushTools();
    result.push({ kind: 'message', message: msg });
  }
  flushTools();

  return result;
}

// ── Main ToolCallGroup component ────────────────────────────────

/**
 * @param tools       — tool messages in this group
 * @param isFinalized — true when no more tools will be added to this group
 *                      (a non-tool message follows it, or the session stopped streaming)
 * @param workspaceId — workspace ID for ctrl+click file path support
 */
export const ToolCallGroup = memo(function ToolCallGroup({
  tools,
  isFinalized = true,
  workspaceId = null,
}: {
  tools: ChatToolCallMessage[];
  isFinalized?: boolean;
  workspaceId?: string | null;
}) {
  const status = deriveGroupStatus(tools);
  const isRunning = status === 'running';

  const [showDetails, setShowDetails] = useState(false);

  // Track whether the group was ever running (live) vs loaded from history.
  const wasEverRunning = useRef(isRunning);
  if (isRunning) wasEverRunning.current = true;

  // Manual toggle override — `null` means follow automatic behaviour.
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);

  // Auto behaviour:
  //  - Live group, not finalized: stay expanded (tools may still arrive)
  //  - Live group, finalized + all done: collapse
  //  - Loaded group (never ran): stay collapsed
  const autoExpanded = wasEverRunning.current ? (!isFinalized || isRunning) : false;
  const expanded = manualExpanded ?? autoExpanded;

  // Clear manual override when the group becomes finalized (final collapse)
  // or when new tools start running (re-expand).
  const prevFinalized = useRef(isFinalized);
  useEffect(() => {
    if (isFinalized && !prevFinalized.current) {
      setManualExpanded(null);
    }
    prevFinalized.current = isFinalized;
  }, [isFinalized]);

  useEffect(() => {
    if (isRunning) setManualExpanded(null);
  }, [isRunning]);

  // Single tool: render with matching group-style wrapper
  if (tools.length === 1) {
    return <SingleToolCall tool={tools[0]} workspaceId={workspaceId} />;
  }

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
      {/* Summary bar */}
      <button
        onClick={() => setManualExpanded((prev) => !(prev ?? expanded))}
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

        <WrenchIcon className="size-3.5 text-[var(--text-muted)]" />
        {groupStatusIcon(status)}

        <span className="text-xs font-medium text-[var(--text-secondary)]">
          {groupStatusLabel(status, tools.length)}
        </span>
      </button>

      {/* Expanded: list of tool lines */}
      <AnimatePresence>
        {expanded && (
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
                  <div className="py-1">
                    {tools.map((tool, i) => (
                      <ToolLine key={tool.id} tool={tool} index={i} workspaceId={workspaceId} />
                    ))}
                  </div>
                  <div className="border-t border-[var(--border-subtle)]/60 px-3 py-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDetails(true);
                      }}
                      className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      Show full details
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-0 p-2">
                    {tools.map((tool) => (
                      <ToolDetail key={tool.id} tool={tool} />
                    ))}
                  </div>
                  <div className="border-t border-[var(--border-subtle)]/60 px-3 py-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDetails(false);
                      }}
                      className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      Collapse details
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}, (prev, next) => {
  if (prev.isFinalized !== next.isFinalized || prev.workspaceId !== next.workspaceId) return false;
  if (prev.tools.length !== next.tools.length) return false;
  for (let i = 0; i < prev.tools.length; i++) {
    const a = prev.tools[i], b = next.tools[i];
    if (a.id !== b.id || a.state !== b.state || a.output !== b.output) return false;
  }
  return true;
});
