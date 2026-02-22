import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  WrenchIcon,
} from 'lucide-react';
import { cn } from '@sero/ui/lib/utils';
import type { ChatToolCallMessage } from '@/types/ipc';
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from '@sero/ui/components/ai-elements/tool';
import { useEditorBridge } from '@/stores/editor-bridge';
import { looksLikeFilePath } from './ClickableFilePath';

// ── Types ───────────────────────────────────────────────────────

export type GroupedChatItem =
  | { kind: 'message'; message: import('@/types/ipc').ChatMessage }
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
  messages: import('@/types/ipc').ChatMessage[],
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

// ── Map tool state ──────────────────────────────────────────────

function mapToolState(
  state: ChatToolCallMessage['state'],
): 'input-streaming' | 'input-available' | 'output-available' | 'output-error' {
  switch (state) {
    case 'pending':
      return 'input-streaming';
    case 'running':
      return 'input-available';
    case 'completed':
      return 'output-available';
    case 'error':
    case 'cancelled':
      return 'output-error';
  }
}

// ── Group status helpers ────────────────────────────────────────

type GroupStatus = 'running' | 'completed' | 'error' | 'cancelled';

function deriveGroupStatus(tools: ChatToolCallMessage[]): GroupStatus {
  const hasRunning = tools.some((t) => t.state === 'pending' || t.state === 'running');
  const hasCancelled = tools.some((t) => t.state === 'cancelled');
  const hasError = tools.some((t) => t.state === 'error');

  if (hasRunning) return 'running';
  if (hasCancelled) return 'cancelled';
  if (hasError) return 'error';
  return 'completed';
}

function groupStatusIcon(status: GroupStatus) {
  switch (status) {
    case 'running':
      return <Loader2 className="size-3.5 animate-spin text-blue-600 dark:text-blue-400" />;
    case 'completed':
      return <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-500" />;
    case 'error':
      return <XCircle className="size-3.5 text-red-600 dark:text-red-400" />;
    case 'cancelled':
      return <AlertCircle className="size-3.5 text-yellow-600 dark:text-yellow-500" />;
  }
}

function groupStatusLabel(status: GroupStatus, count: number) {
  const noun = count === 1 ? 'action' : 'actions';
  switch (status) {
    case 'running':
      return `Running ${count} ${noun}…`;
    case 'completed':
      return `${count} ${noun} completed`;
    case 'error':
      return `${count} ${noun} (has errors)`;
    case 'cancelled':
      return `${count} ${noun} (cancelled)`;
  }
}

// ── Single tool line (collapsed view) ───────────────────────────

function toolStatusDot(state: ChatToolCallMessage['state']) {
  switch (state) {
    case 'pending':
      return <span className="size-1.5 shrink-0 rounded-full bg-zinc-400 dark:bg-zinc-500" />;
    case 'running':
      return <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-blue-500 dark:bg-blue-400" />;
    case 'completed':
      return <span className="size-1.5 shrink-0 rounded-full bg-emerald-600 dark:bg-emerald-500" />;
    case 'error':
      return <span className="size-1.5 shrink-0 rounded-full bg-red-500 dark:bg-red-400" />;
    case 'cancelled':
      return <span className="size-1.5 shrink-0 rounded-full bg-yellow-600 dark:bg-yellow-500" />;
  }
}

function ToolLine({
  tool,
  index,
  workspaceId,
}: {
  tool: ChatToolCallMessage;
  index: number;
  workspaceId: string | null;
}) {
  const requestOpenFile = useEditorBridge((s) => s.requestOpenFile);

  const summary = useMemo(() => {
    const inp = tool.input;
    // Try to build a short summary from common tool input shapes
    if (inp.command && typeof inp.command === 'string') return inp.command;
    if (inp.path && typeof inp.path === 'string') return inp.path;
    if (inp.file_path && typeof inp.file_path === 'string') return inp.file_path as string;
    if (inp.query && typeof inp.query === 'string') return inp.query;
    if (inp.pattern && typeof inp.pattern === 'string') return inp.pattern;
    if (inp.url && typeof inp.url === 'string') return inp.url;
    // Fallback: first string value
    const first = Object.values(inp).find((v) => typeof v === 'string');
    return typeof first === 'string' ? first : '';
  }, [tool.input]);

  const isFilePath = useMemo(
    () => !!summary && looksLikeFilePath(summary),
    [summary],
  );

  const handleSummaryClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.ctrlKey || e.metaKey) && isFilePath && workspaceId) {
        e.preventDefault();
        e.stopPropagation();
        const filePath = summary.startsWith('/') ? summary : `/${summary}`;
        requestOpenFile(workspaceId, filePath);
      }
    },
    [isFilePath, workspaceId, summary, requestOpenFile],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: index * 0.03 }}
      className="flex items-center gap-2 px-3 py-1"
    >
      {toolStatusDot(tool.state)}
      <span className="shrink-0 text-[11px] font-medium text-[var(--text-muted)]">
        {tool.toolName}
      </span>
      {summary && (
        <span
          onClick={handleSummaryClick}
          className={cn(
            'min-w-0 truncate text-[11px] text-[var(--text-muted)]/60',
            isFilePath && workspaceId &&
              'cursor-pointer underline decoration-dotted decoration-[var(--text-muted)]/30 underline-offset-2 hover:decoration-[var(--accent)] hover:text-[var(--text-secondary)]',
          )}
          title={isFilePath ? 'Ctrl+click to open in editor' : undefined}
        >
          {summary}
        </span>
      )}
    </motion.div>
  );
}

// ── Expanded single tool (full detail) ──────────────────────────

function ToolDetail({ tool }: { tool: ChatToolCallMessage }) {
  const isComplete = tool.state === 'completed' || tool.state === 'error';
  const isCancelled = tool.state === 'cancelled';

  return (
    <Tool defaultOpen={isComplete}>
      <ToolHeader
        type={`tool-${tool.toolName}` as `tool-${string}`}
        state={mapToolState(tool.state)}
      />
      <ToolContent>
        <ToolInput input={tool.input} />
        {isComplete && (
          <ToolOutput
            output={tool.output}
            errorText={tool.isError ? (tool.output ?? 'Tool execution failed') : undefined}
          />
        )}
        {isCancelled && (
          <div className="text-xs text-yellow-500/80 italic">
            Cancelled — agent was stopped before this tool completed.
          </div>
        )}
      </ToolContent>
    </Tool>
  );
}

// ── Single tool call (matches group wrapper style) ──────────────

function SingleToolCall({
  tool,
  workspaceId,
}: {
  tool: ChatToolCallMessage;
  workspaceId: string | null;
}) {
  const requestOpenFile = useEditorBridge((s) => s.requestOpenFile);
  const status = deriveGroupStatus([tool]);
  const isRunning = status === 'running';
  const isComplete = tool.state === 'completed' || tool.state === 'error';
  const isCancelled = tool.state === 'cancelled';
  const [expanded, setExpanded] = useState(false);

  const summary = useMemo(() => {
    const inp = tool.input;
    if (inp.command && typeof inp.command === 'string') return inp.command;
    if (inp.path && typeof inp.path === 'string') return inp.path;
    if (inp.file_path && typeof inp.file_path === 'string') return inp.file_path as string;
    if (inp.query && typeof inp.query === 'string') return inp.query;
    if (inp.pattern && typeof inp.pattern === 'string') return inp.pattern;
    if (inp.url && typeof inp.url === 'string') return inp.url;
    const first = Object.values(inp).find((v) => typeof v === 'string');
    return typeof first === 'string' ? first : '';
  }, [tool.input]);

  const isFilePath = useMemo(
    () => !!summary && looksLikeFilePath(summary),
    [summary],
  );

  const handleSummaryClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.ctrlKey || e.metaKey) && isFilePath && workspaceId) {
        e.preventDefault();
        e.stopPropagation();
        const filePath = summary.startsWith('/') ? summary : `/${summary}`;
        requestOpenFile(workspaceId, filePath);
      }
    },
    [isFilePath, workspaceId, summary, requestOpenFile],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group/tg overflow-hidden rounded-lg border transition-colors duration-200',
        isRunning
          ? 'border-blue-500/20 bg-blue-500/[0.03]'
          : status === 'error'
            ? 'border-red-500/20 bg-red-500/[0.03]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50',
      )}
    >
      {/* Summary bar */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
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
          {tool.toolName}
        </span>
        {summary && (
          <span
            onClick={handleSummaryClick}
            className={cn(
              'min-w-0 truncate text-[11px] text-[var(--text-muted)]/60',
              isFilePath && workspaceId &&
                'cursor-pointer underline decoration-dotted decoration-[var(--text-muted)]/30 underline-offset-2 hover:decoration-[var(--accent)] hover:text-[var(--text-secondary)]',
            )}
            title={isFilePath ? 'Ctrl+click to open in editor' : undefined}
          >
            {summary}
          </span>
        )}
      </button>

      {/* Expanded: tool input / output */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border-subtle)] space-y-4 p-3">
              <ToolInput input={tool.input} />
              {isComplete && (
                <ToolOutput
                  output={tool.output}
                  errorText={tool.isError ? (tool.output ?? 'Tool execution failed') : undefined}
                />
              )}
              {isCancelled && (
                <div className="text-xs text-yellow-500/80 italic">
                  Cancelled — agent was stopped before this tool completed.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main ToolCallGroup component ────────────────────────────────

/**
 * @param tools       — tool messages in this group
 * @param isFinalized — true when no more tools will be added to this group
 *                      (a non-tool message follows it, or the session stopped streaming)
 * @param workspaceId — workspace ID for ctrl+click file path support
 */
export function ToolCallGroup({
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
          ? 'border-blue-500/20 bg-blue-500/[0.03]'
          : status === 'error'
            ? 'border-red-500/20 bg-red-500/[0.03]'
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
                      className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
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
                      className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
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
}
