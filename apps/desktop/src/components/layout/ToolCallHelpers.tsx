/**
 * Helper functions and sub-components for ToolCallGroup.
 * Extracted to keep ToolCallGroup.tsx under 500 LOC.
 */
import { useState, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@sero/ui/lib/utils';
import type { ChatToolCallMessage, ToolResultImage } from '@/types/ipc';
import { useLightbox, type LightboxImage } from './ImageLightbox';
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from '@sero/ui/components/ai-elements/tool';
import { useEditorBridge } from '@/stores/editor-bridge';
import { looksLikeFilePath } from './ClickableFilePath';

/** Tools whose summary arg is a real file path worth linking. */
const FILE_PATH_TOOLS = new Set(['edit', 'read', 'write']);

// ── Map tool state ──────────────────────────────────────────────

export function mapToolState(
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

export type GroupStatus = 'running' | 'completed' | 'error' | 'cancelled';

export function deriveGroupStatus(tools: ChatToolCallMessage[]): GroupStatus {
  const hasRunning = tools.some((t) => t.state === 'pending' || t.state === 'running');
  const hasCancelled = tools.some((t) => t.state === 'cancelled');
  const hasError = tools.some((t) => t.state === 'error');

  if (hasRunning) return 'running';
  if (hasCancelled) return 'cancelled';
  if (hasError) return 'error';
  return 'completed';
}

export function groupStatusIcon(status: GroupStatus) {
  switch (status) {
    case 'running':
      return <Loader2 className="size-3.5 animate-spin text-[var(--status-info)]" />;
    case 'completed':
      return <CheckCircle2 className="size-3.5 text-[var(--status-success)]" />;
    case 'error':
      return <XCircle className="size-3.5 text-[var(--status-error)]" />;
    case 'cancelled':
      return <AlertCircle className="size-3.5 text-[var(--status-warning)]" />;
  }
}

export function groupStatusLabel(status: GroupStatus, count: number) {
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

export function toolStatusDot(state: ChatToolCallMessage['state']) {
  switch (state) {
    case 'pending':
      return <span className="size-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" />;
    case 'running':
      return <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--status-info)]" />;
    case 'completed':
      return <span className="size-1.5 shrink-0 rounded-full bg-[var(--status-success)]" />;
    case 'error':
      return <span className="size-1.5 shrink-0 rounded-full bg-[var(--status-error)]" />;
    case 'cancelled':
      return <span className="size-1.5 shrink-0 rounded-full bg-[var(--status-warning)]" />;
  }
}

// ── Shared summary extraction ───────────────────────────────────

export function extractToolSummary(input: Record<string, unknown>): string {
  if (input.command && typeof input.command === 'string') return input.command;
  if (input.path && typeof input.path === 'string') return input.path;
  if (input.file_path && typeof input.file_path === 'string') return input.file_path as string;
  if (input.query && typeof input.query === 'string') return input.query;
  if (input.pattern && typeof input.pattern === 'string') return input.pattern;
  if (input.url && typeof input.url === 'string') return input.url;
  const first = Object.values(input).find((v) => typeof v === 'string');
  return typeof first === 'string' ? first : '';
}

// ── ToolLine (collapsed row inside a multi-tool group) ──────────

export function ToolLine({
  tool,
  index,
  workspaceId,
}: {
  tool: ChatToolCallMessage;
  index: number;
  workspaceId: string | null;
}) {
  const requestOpenFile = useEditorBridge((s) => s.requestOpenFile);
  const summary = useMemo(() => extractToolSummary(tool.input), [tool.input]);

  const isFilePath = useMemo(
    () => !!summary && FILE_PATH_TOOLS.has(tool.toolName) && looksLikeFilePath(summary),
    [summary, tool.toolName],
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
            'min-w-0 truncate text-[11px] text-[var(--text-secondary)]',
            isFilePath && workspaceId &&
              'cursor-pointer underline decoration-dotted decoration-[var(--text-muted)]/60 underline-offset-2 hover:decoration-[var(--accent-primary)] hover:text-[var(--text-primary)]',
          )}
          title={isFilePath ? 'Ctrl+click to open in editor' : undefined}
        >
          {summary}
        </span>
      )}
    </motion.div>
  );
}

// ── ToolImages (thumbnail strip for tool result images) ─────────

function ToolImages({ images }: { images: ToolResultImage[] }) {
  const showLightbox = useLightbox((s) => s.show);

  const lightboxImages: LightboxImage[] = useMemo(
    () =>
      images.map((img) => ({
        src: img.data,
        mimeType: img.mimeType,
        alt: img.description,
      })),
    [images],
  );

  const handleClick = useCallback(
    (index: number) => showLightbox(lightboxImages, index),
    [showLightbox, lightboxImages],
  );

  return (
    <div className="flex flex-wrap gap-2 py-1">
      {images.map((img, i) => {
        const src = img.data.startsWith('data:')
          ? img.data
          : `data:${img.mimeType ?? 'image/png'};base64,${img.data}`;
        return (
          <button
            key={i}
            onClick={() => handleClick(i)}
            className={cn(
              'group/img relative overflow-hidden rounded-md border border-[var(--border-subtle)]',
              'transition-all hover:border-[var(--accent-primary)] hover:shadow-md',
              'cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]',
            )}
            title={img.description ?? 'Click to preview'}
          >
            <img
              src={src}
              alt={img.description ?? 'Tool result image'}
              className="h-24 w-auto max-w-[200px] object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 transition-colors group-hover/img:bg-black/10" />
          </button>
        );
      })}
    </div>
  );
}

// ── ToolDetail (expanded single tool — full input/output) ───────

export function ToolDetail({ tool }: { tool: ChatToolCallMessage }) {
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
        {isComplete && tool.images?.length ? <ToolImages images={tool.images} /> : null}
        {isComplete && (
          <ToolOutput
            output={tool.output}
            errorText={tool.isError ? (tool.output ?? 'Tool execution failed') : undefined}
          />
        )}
        {isCancelled && (
          <div className="text-xs text-[var(--status-warning)] italic">
            Cancelled — agent was stopped before this tool completed.
          </div>
        )}
      </ToolContent>
    </Tool>
  );
}

// ── SingleToolCall (standalone wrapper matching group style) ─────

export function SingleToolCall({
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
  const hasImages = !!tool.images?.length;
  const [expanded, setExpanded] = useState(false);

  const summary = useMemo(() => extractToolSummary(tool.input), [tool.input]);

  const isFilePath = useMemo(
    () => !!summary && FILE_PATH_TOOLS.has(tool.toolName) && looksLikeFilePath(summary),
    [summary, tool.toolName],
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
          ? 'border-[var(--status-info-border)] bg-[var(--status-info-faint)]'
          : status === 'error'
            ? 'border-[var(--status-error-border)] bg-[var(--status-error-faint)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50',
      )}
    >
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
              'min-w-0 truncate text-[11px] text-[var(--text-secondary)]',
              isFilePath && workspaceId &&
                'cursor-pointer underline decoration-dotted decoration-[var(--text-muted)]/60 underline-offset-2 hover:decoration-[var(--accent-primary)] hover:text-[var(--text-primary)]',
            )}
            title={isFilePath ? 'Ctrl+click to open in editor' : undefined}
          >
            {summary}
          </span>
        )}
      </button>

      {/* Inline image thumbnails — always visible when tool has images */}
      {hasImages && !expanded && (
        <div className="border-t border-[var(--border-subtle)] px-3 py-2">
          <ToolImages images={tool.images!} />
        </div>
      )}

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
              {isComplete && hasImages ? <ToolImages images={tool.images!} /> : null}
              {isComplete && (
                <ToolOutput
                  output={tool.output}
                  errorText={tool.isError ? (tool.output ?? 'Tool execution failed') : undefined}
                />
              )}
              {isCancelled && (
                <div className="text-xs text-[var(--status-warning)] italic">
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
