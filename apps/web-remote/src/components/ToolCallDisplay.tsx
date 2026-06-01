/**
 * Tool call display — collapsible groups showing tool execution status,
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
    running: <Loader2 className="size-3.5 animate-spin text-yellow-500" />,
    done: <Check className="size-3.5 text-green-500" />,
    error: <X className="size-3.5 text-destructive" />,
  }[tc.state];

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
          <span className="font-mono truncate">{tc.toolName}</span>
        </CollapsibleTrigger>

        {/* Tool result images — always visible, click to open lightbox */}
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

  const running = toolCalls.filter((tc) => tc.state === 'running').length;
  const done = toolCalls.filter((tc) => tc.state === 'done').length;
  const errors = toolCalls.filter((tc) => tc.state === 'error').length;

  const summary = running > 0
    ? `${running} running`
    : errors > 0
      ? `${errors} failed`
      : `${done} complete`;

  return (
    <div className="bg-card border border-border rounded-lg p-2 my-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5 px-1">
        <Wrench className="size-3.5" />
        <span>
          {toolCalls.length} tool call{toolCalls.length > 1 ? 's' : ''}
        </span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {summary}
        </Badge>
      </div>

      <div className="space-y-0.5">
        {toolCalls.map((tc) => (
          <ToolCallItem key={tc.toolCallId} tc={tc} />
        ))}
      </div>
    </div>
  );
});
