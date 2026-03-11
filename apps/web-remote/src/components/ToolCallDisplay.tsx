/**
 * Tool call display — collapsible groups showing tool execution status.
 */

import { useState, memo } from 'react';
import { cn } from '@/lib/cn';
import type { ToolCall } from '@/stores/chat';
import { ChevronDown, ChevronRight, Loader2, Check, X, Wrench } from 'lucide-react';

interface ToolCallDisplayProps {
  toolCalls: ToolCall[];
}

const MAX_OUTPUT_PREVIEW = 300;

const ToolCallItem = memo(function ToolCallItem({ tc }: { tc: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    running: <Loader2 className="w-3.5 h-3.5 animate-spin text-yellow-500" />,
    done: <Check className="w-3.5 h-3.5 text-green-500" />,
    error: <X className="w-3.5 h-3.5 text-destructive" />,
  }[tc.state];

  const hasOutput = tc.output && tc.output.length > 0;

  return (
    <div className="border-l-2 border-muted pl-3 py-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
      >
        {hasOutput ? (
          expanded ? (
            <ChevronDown className="w-3 h-3 shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 shrink-0" />
          )
        ) : (
          <span className="w-3 h-3 shrink-0" />
        )}
        {statusIcon}
        <Wrench className="w-3 h-3 shrink-0" />
        <span className="font-mono truncate">{tc.toolName}</span>
      </button>

      {expanded && hasOutput && (
        <pre className="mt-1 ml-6 text-xs text-muted-foreground bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-[200px] overflow-y-auto">
          {tc.output!.length > MAX_OUTPUT_PREVIEW
            ? tc.output!.slice(0, MAX_OUTPUT_PREVIEW) + '...'
            : tc.output}
        </pre>
      )}
    </div>
  );
});

export const ToolCallDisplay = memo(function ToolCallDisplay({
  toolCalls,
}: ToolCallDisplayProps) {
  if (toolCalls.length === 0) return null;

  const running = toolCalls.filter((tc) => tc.state === 'running').length;
  const done = toolCalls.filter((tc) => tc.state === 'done').length;
  const errors = toolCalls.filter((tc) => tc.state === 'error').length;

  return (
    <div className={cn('bg-card border border-border rounded-lg p-2 my-1')}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5 px-1">
        <Wrench className="w-3.5 h-3.5" />
        <span>
          {toolCalls.length} tool call{toolCalls.length > 1 ? 's' : ''}
          {running > 0 && ` (${running} running)`}
          {errors > 0 && ` (${errors} failed)`}
          {running === 0 && errors === 0 && ` (${done} complete)`}
        </span>
      </div>

      <div className="space-y-0.5">
        {toolCalls.map((tc) => (
          <ToolCallItem key={tc.toolCallId} tc={tc} />
        ))}
      </div>
    </div>
  );
});
