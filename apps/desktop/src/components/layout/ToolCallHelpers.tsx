/**
 * Display sub-components for ToolCallGroup.
 * Pure state helpers live in ToolCallState.tsx.
 */
import { useState, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { ChatToolCallMessage, ToolResultImage } from '@/types/ipc';
import {
  ToolCallProgress,
  buildToolProgressModel,
  getEffectiveToolName,
} from './ToolCallProgress';
import { useLightbox, type LightboxImage } from './ImageLightbox';
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from '@sero-ai/ui/components/ai-elements/tool';
import { useEditorBridge } from '@/stores/editor-bridge';
import { looksLikeFilePath } from './ClickableFilePath';
import {
  mapToolState,
  toolStatusDot,
  getCollapsedToolSummary,
  deriveGroupStatus,
} from './ToolCallState';

// Re-export state helpers so existing imports from this module keep working.
export {
  deriveGroupStatus,
  groupStatusIcon,
  groupStatusLabel,
  getCollapsedToolSummary,
  type GroupStatus,
} from './ToolCallState';

/** Tools whose summary arg is a real file path worth linking. */
const FILE_PATH_TOOLS = new Set(['edit', 'read', 'write']);

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
  const progressModel = useMemo(() => buildToolProgressModel(tool), [tool]);
  const summary = useMemo(
    () => getCollapsedToolSummary(tool),
    [tool],
  );
  const effectiveToolName = useMemo(() => getEffectiveToolName(tool), [tool]);

  const isFilePath = useMemo(
    () => !progressModel && !!summary && FILE_PATH_TOOLS.has(tool.toolName) && looksLikeFilePath(summary),
    [progressModel, summary, tool.toolName],
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
        {effectiveToolName}
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

export function ToolImages({
  images,
  workspaceId = null,
}: {
  images: ToolResultImage[];
  workspaceId?: string | null;
}) {
  const showLightbox = useLightbox((s) => s.show);
  const requestOpenFile = useEditorBridge((s) => s.requestOpenFile);

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

  const handlePathClick = useCallback((filePath: string) => {
    if (!workspaceId) return;
    requestOpenFile(workspaceId, filePath);
  }, [requestOpenFile, workspaceId]);

  return (
    <div className="flex flex-wrap gap-3 py-1">
      {images.map((img, i) => {
        const src = img.data.startsWith('data:')
          ? img.data
          : `data:${img.mimeType ?? 'image/png'};base64,${img.data}`;
        const isOpenablePath = !!workspaceId && !!img.filePath && looksLikeFilePath(img.filePath);
        return (
          <div key={i} className="flex max-w-[220px] flex-col gap-1.5">
            <button
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
            {img.filePath ? (
              isOpenablePath ? (
                <button
                  onClick={() => handlePathClick(img.filePath!)}
                  className="truncate rounded bg-[var(--bg-elevated)] px-2 py-1 text-left font-mono text-[10px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  title={`Open ${img.filePath} in editor`}
                >
                  {img.filePath}
                </button>
              ) : (
                <div
                  className="truncate rounded bg-[var(--bg-elevated)] px-2 py-1 font-mono text-[10px] text-[var(--text-secondary)]"
                  title={img.filePath}
                >
                  {img.filePath}
                </div>
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ── ToolDetail (expanded single tool — full input/output) ───────

export function ToolDetail({ tool, workspaceId = null }: { tool: ChatToolCallMessage; workspaceId?: string | null }) {
  const isComplete = tool.state === 'completed' || tool.state === 'error';
  const isCancelled = tool.state === 'cancelled';
  const hasOutput = typeof tool.output === 'string' && tool.output.trim().length > 0;
  const progressModel = buildToolProgressModel(tool);
  const effectiveToolName = useMemo(() => getEffectiveToolName(tool), [tool]);

  return (
    <Tool
      defaultOpen={isComplete || tool.state === 'running'}
      className="border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 mb-2"
    >
      <ToolHeader
        title={effectiveToolName}
        type={`tool-${effectiveToolName}` as `tool-${string}`}
        state={mapToolState(tool.state)}
        className="border-b border-[var(--border-subtle)]/60 p-1.5"
      />
      <ToolContent className="max-h-[min(52vh,30rem)] overflow-y-auto overscroll-contain space-y-0 p-0 [scrollbar-gutter:stable]">
        <ToolInput
          input={tool.input}
          className="rounded-none border border-[var(--border-subtle)]/60 bg-[var(--bg-surface)]/60 p-2.5 [&_[data-language]]:border-[var(--border-subtle)]/60 [&_[data-language]]:bg-[var(--bg-elevated)]/40"
        />
        {isComplete && tool.images?.length ? <ToolImages images={tool.images} workspaceId={workspaceId} /> : null}
        {progressModel ? <ToolCallProgress tool={tool} /> : null}
        {(isComplete || (hasOutput && !progressModel)) && (
          <>
            <ToolOutput
              className="rounded-none border border-[var(--border-subtle)]/60 bg-[var(--bg-surface)]/60 p-2.5 [&_[data-language]]:border-[var(--border-subtle)]/60 [&_[data-language]]:bg-[var(--bg-elevated)]/40"
              output={tool.output}
              errorText={tool.isError ? (tool.output ?? 'Tool execution failed') : undefined}
            />
            {!isComplete && tool.isPartialOutput && !progressModel && (
              <div className="mt-2 text-xs text-[var(--status-info)] italic">
                Live update — tool still running.
              </div>
            )}
          </>
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
  const progressModel = buildToolProgressModel(tool);
  const [expanded, setExpanded] = useState(() => isRunning);
  const [showDetails, setShowDetails] = useState(false);

  const summary = useMemo(
    () => getCollapsedToolSummary(tool),
    [tool],
  );
  const effectiveToolName = useMemo(() => getEffectiveToolName(tool), [tool]);
  const hasSummaryContent = !!progressModel || (isComplete && hasImages) || isCancelled;

  const isFilePath = useMemo(
    () => !progressModel && !!summary && FILE_PATH_TOOLS.has(tool.toolName) && looksLikeFilePath(summary),
    [progressModel, summary, tool.toolName],
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
          {effectiveToolName}
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
        {progressModel && (
          <span className="rounded-full bg-[var(--status-info-subtle)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--status-info)]">
            Live
          </span>
        )}
      </button>

      {!expanded && progressModel && (
        <div className="border-t border-[var(--border-subtle)] p-3">
          <ToolCallProgress tool={tool} />
        </div>
      )}

      {/* Inline image thumbnails — always visible when tool has images */}
      {hasImages && !expanded && (
        <div className="border-t border-[var(--border-subtle)] px-3 py-2">
          <ToolImages images={tool.images!} workspaceId={workspaceId} />
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
            <div className="border-t border-[var(--border-subtle)]">
              {!showDetails ? (
                <>
                  {hasSummaryContent ? (
                    <div className="space-y-4 p-3">
                      {progressModel ? <ToolCallProgress tool={tool} /> : null}
                      {!progressModel && isComplete && hasImages ? <ToolImages images={tool.images!} workspaceId={workspaceId} /> : null}
                      {isCancelled && (
                        <div className="text-xs text-[var(--status-warning)] italic">
                          Cancelled — agent was stopped before this tool completed.
                        </div>
                      )}
                    </div>
                  ) : null}
                  <div className={cn(
                    'px-3 py-1.5',
                    hasSummaryContent && 'border-t border-[var(--border-subtle)]/60',
                  )}>
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
                    <ToolDetail tool={tool} workspaceId={workspaceId} />
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
}
