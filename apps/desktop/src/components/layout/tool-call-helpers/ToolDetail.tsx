import { useMemo } from 'react';
import type { ChatToolCallMessage } from '@/types/ipc';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@sero-ai/ui/components/ai-elements/tool';
import {
  ToolCallProgress,
  buildToolProgressModel,
  getEffectiveToolName,
} from '../ToolCallProgress';
import { mapToolState } from '../ToolCallState';
import { ToolImages } from './ToolImages';
import { ToolFileLinks } from './ToolFileLinks';

export function ToolDetail({
  tool,
  workspaceId = null,
}: {
  tool: ChatToolCallMessage;
  workspaceId?: string | null;
}) {
  const isComplete = tool.state === 'completed' || tool.state === 'error';
  const isCancelled = tool.state === 'cancelled';
  const hasOutput = typeof tool.output === 'string' && tool.output.trim().length > 0;
  const progressModel = buildToolProgressModel(tool);
  const effectiveToolName = useMemo(() => getEffectiveToolName(tool), [tool]);

  return (
    <Tool
      defaultOpen={isComplete || tool.state === 'running'}
      className="mb-2 border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30"
    >
      <ToolHeader
        title={effectiveToolName}
        type={`tool-${effectiveToolName}` as `tool-${string}`}
        state={mapToolState(tool.state)}
        className="border-b border-[var(--border-subtle)]/60 p-1.5"
      />
      <ToolContent className="max-h-[min(52vh,30rem)] space-y-0 overflow-y-auto overscroll-contain p-0 [scrollbar-gutter:stable]">
        <ToolInput
          input={tool.input}
          className="rounded-none border border-[var(--border-subtle)]/60 bg-[var(--bg-surface)]/60 p-2.5 [&_[data-language]]:border-[var(--border-subtle)]/60 [&_[data-language]]:bg-[var(--bg-elevated)]/40"
        />
        {isComplete && tool.images?.length ? (
          <ToolImages images={tool.images} workspaceId={workspaceId} />
        ) : null}
        {isComplete ? <ToolFileLinks details={tool.details} workspaceId={workspaceId} /> : null}
        {progressModel ? <ToolCallProgress tool={tool} /> : null}
        {isComplete || (hasOutput && !progressModel) ? (
          <>
            <ToolOutput
              className="rounded-none border border-[var(--border-subtle)]/60 bg-[var(--bg-surface)]/60 p-2.5 [&_[data-language]]:border-[var(--border-subtle)]/60 [&_[data-language]]:bg-[var(--bg-elevated)]/40"
              output={tool.output}
              errorText={tool.isError ? (tool.output ?? 'Tool execution failed') : undefined}
            />
            {!isComplete && tool.isPartialOutput && !progressModel ? (
              <div className="mt-2 text-xs italic text-[var(--status-info)]">
                Live update — tool still running.
              </div>
            ) : null}
          </>
        ) : null}
        {isCancelled ? (
          <div className="text-xs italic text-[var(--status-warning)]">
            Cancelled — agent was stopped before this tool completed.
          </div>
        ) : null}
      </ToolContent>
    </Tool>
  );
}
