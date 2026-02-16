import { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  WrenchIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatToolCallMessage } from '@/types/ipc';
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool';

// ── Types ───────────────────────────────────────────────────────

export type GroupedChatItem =
  | { kind: 'message'; message: import('@/types/ipc').ChatMessage }
  | { kind: 'tool-group'; tools: ChatToolCallMessage[]; id: string };

// ── Grouping utility ────────────────────────────────────────────

/**
 * Groups consecutive tool messages into collapsed blocks.
 * Text messages (user/assistant) break the grouping.
 */
export function groupMessages(
  messages: import('@/types/ipc').ChatMessage[],
): GroupedChatItem[] {
  const result: GroupedChatItem[] = [];
  let toolBuffer: ChatToolCallMessage[] = [];

  const flushTools = () => {
    if (toolBuffer.length === 0) return;
    // Use the first tool's id as the group id for stable keys
    result.push({
      kind: 'tool-group',
      tools: [...toolBuffer],
      id: `tg-${toolBuffer[0].id}`,
    });
    toolBuffer = [];
  };

  for (const msg of messages) {
    if (msg.type === 'tool') {
      toolBuffer.push(msg);
    } else {
      flushTools();
      result.push({ kind: 'message', message: msg });
    }
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
      return <Loader2 className="size-3.5 animate-spin text-blue-400" />;
    case 'completed':
      return <CheckCircle2 className="size-3.5 text-emerald-500" />;
    case 'error':
      return <XCircle className="size-3.5 text-red-400" />;
    case 'cancelled':
      return <AlertCircle className="size-3.5 text-yellow-500" />;
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
      return <span className="size-1.5 shrink-0 rounded-full bg-zinc-500" />;
    case 'running':
      return <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-blue-400" />;
    case 'completed':
      return <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />;
    case 'error':
      return <span className="size-1.5 shrink-0 rounded-full bg-red-400" />;
    case 'cancelled':
      return <span className="size-1.5 shrink-0 rounded-full bg-yellow-500" />;
  }
}

function ToolLine({ tool, index }: { tool: ChatToolCallMessage; index: number }) {
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
        <span className="min-w-0 truncate text-[11px] text-[var(--text-muted)]/60">
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

// ── Main ToolCallGroup component ────────────────────────────────

export function ToolCallGroup({ tools }: { tools: ChatToolCallMessage[] }) {
  const [expanded, setExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const status = deriveGroupStatus(tools);
  const isRunning = status === 'running';

  // Single tool: just render it inline, no group wrapper
  if (tools.length === 1) {
    return <ToolDetail tool={tools[0]} />;
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
            : 'border-border/50 bg-[var(--bg-elevated)]/50',
      )}
    >
      {/* Summary bar */}
      <button
        onClick={() => setExpanded((p) => !p)}
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

        {/* Tool name pills (collapsed) */}
        {!expanded && (
          <div className="ml-auto flex items-center gap-1 overflow-hidden">
            {tools.slice(0, 4).map((t) => (
              <span
                key={t.id}
                className="shrink-0 rounded bg-[var(--bg-base)]/60 px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]"
              >
                {t.toolName}
              </span>
            ))}
            {tools.length > 4 && (
              <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                +{tools.length - 4}
              </span>
            )}
          </div>
        )}
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
            <div className="border-t border-border/30">
              {!showDetails ? (
                <>
                  <div className="py-1">
                    {tools.map((tool, i) => (
                      <ToolLine key={tool.id} tool={tool} index={i} />
                    ))}
                  </div>
                  <div className="border-t border-border/20 px-3 py-1.5">
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
                  <div className="border-t border-border/20 px-3 py-1.5">
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
