/**
 * Tool call display, collapsible groups showing tool execution status,
 * with inline image rendering and lightbox support.
 */

import { useState, memo } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@sero-ai/ui/components/ui/collapsible';
import type { ToolCall } from '@/stores/chat';
import { ImageLightbox } from './ImageLightbox';
import { ChevronDown, Loader2, Check, X, Wrench } from 'lucide-react';

interface ToolCallDisplayProps {
  toolCalls: ToolCall[];
}

const MAX_OUTPUT_PREVIEW = 300;

const ToolCallItem = memo(function ToolCallItem({ tc }: { tc: ToolCall }) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const statusIcon = {
    streaming: <Loader2 className="size-3.5 animate-spin text-status-info" />,
    running: <Loader2 className="size-3.5 animate-spin text-status-warning" />,
    done: <Check className="size-3.5 text-status-success" />,
    error: <X className="size-3.5 text-destructive" />,
    cancelled: <X className="size-3.5 text-muted-foreground" />,
  }[tc.state];

  // While arguments stream, the file being written is the interesting content —
  // the tool has not run, so there is no output yet.
  const streamedContent =
    tc.isStreamingInput && typeof tc.input?.content === 'string' ? tc.input.content : null;
  const streamedPath = typeof tc.input?.path === 'string' ? tc.input.path : null;
  const hasOutput = (tc.output && tc.output.length > 0) || (tc.images && tc.images.length > 0);
  const hasImages = tc.images && tc.images.length > 0;

  return (
    <Collapsible className="group">
      <div className="border-l-2 border-muted pl-3 py-1">
        <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left">
          {hasOutput ? (
            <ChevronDown className="size-3 shrink-0 transition-transform group-data-[state=closed]:-rotate-90" />
          ) : (
            <span className="size-3 shrink-0" />
          )}
          {statusIcon}
          <Wrench className="size-3 shrink-0" />
          <span className="font-mono text-xs truncate">{tc.toolName}</span>
          {streamedPath && (
            <span className="font-mono text-xs truncate text-muted-foreground/70">{streamedPath}</span>
          )}
        </CollapsibleTrigger>

        {streamedContent !== null && (
          <pre className="mt-1 ml-6 flex max-h-[200px] flex-col justify-end overflow-hidden whitespace-pre rounded bg-background p-2 text-xs text-muted-foreground">
            {streamedContent.split('\n').slice(-40).join('\n')}
          </pre>
        )}

        {/* Tool result images, always visible, click to open lightbox */}
        {hasImages && (
          <div className="mt-1 ml-6 flex flex-wrap gap-2">
            {tc.images!.map((img, i) => {
              const src = `data:${img.mimeType};base64,${img.data}`;
              return (
                <button type="button"
                  key={src}
                  onClick={() => setLightboxSrc(src)}
                  className="cursor-zoom-in"
                >
                  <img
                    src={src}
                    alt={img.description ?? `Tool result ${i + 1}`}
                    className="max-w-[300px] max-h-[200px] rounded-md border border-border object-contain hover:border-ring transition-colors"
                  />
                </button>
              );
            })}
          </div>
        )}

        <CollapsibleContent>
          {tc.output && tc.output.length > 0 && (
            <pre className="mt-1 ml-6 text-xs text-muted-foreground bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-[200px] overflow-y-auto">
              {tc.output.length > MAX_OUTPUT_PREVIEW
                ? tc.output.slice(0, MAX_OUTPUT_PREVIEW) + '...'
                : tc.output}
            </pre>
          )}
        </CollapsibleContent>
      </div>

      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt={tc.toolName}
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </Collapsible>
  );
});

export const ToolCallDisplay = memo(function ToolCallDisplay({
  toolCalls,
}: ToolCallDisplayProps) {
  if (toolCalls.length === 0) return null;

  const running = toolCalls.filter(
    (tc) => tc.state === 'running' || tc.state === 'streaming',
  ).length;
  const done = toolCalls.filter((tc) => tc.state === 'done').length;
  const errors = toolCalls.filter((tc) => tc.state === 'error').length;
  const cancelled = toolCalls.filter((tc) => tc.state === 'cancelled').length;

  const summary = running > 0
    ? `${running} running`
    : errors > 0
      ? `${errors} failed`
      : cancelled > 0
        ? `${cancelled} cancelled`
        : `${done} complete`;

  return (
    <div className="bg-card border border-border rounded-lg p-2 my-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5 px-1">
        <Wrench className="size-3.5" />
        <span>
          {toolCalls.length} tool call{toolCalls.length > 1 ? 's' : ''}
        </span>
        <Badge variant="secondary" className="text-sm px-1.5 py-0">
          {summary}
        </Badge>
      </div>

      <div className="space-y-0.5">
        {toolCalls.map((tc) => (
          <ToolCallItem key={tc.renderKey ?? tc.toolCallId} tc={tc} />
        ))}
      </div>
    </div>
  );
});
