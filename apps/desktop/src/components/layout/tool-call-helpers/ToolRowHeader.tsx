import { useMemo } from 'react';
import type { ChatToolCallMessage } from '@/types/ipc';
import { buildToolProgressModel, getEffectiveToolName } from '../ToolCallProgress';
import { getCollapsedToolSummary, toolStatusDot } from '../ToolCallState';
import { ToolSummaryText } from './ToolSummaryText';

/**
 * Identity line for one tool call: status, name, summary. Rendered as flex
 * children so the caller owns the row (a button in rows, a heading in a pane).
 */
export function ToolRowHeader({
  tool,
  workspaceId,
}: {
  tool: ChatToolCallMessage;
  workspaceId: string | null;
}) {
  const progressModel = useMemo(() => buildToolProgressModel(tool), [tool]);
  const summary = useMemo(() => getCollapsedToolSummary(tool), [tool]);
  const effectiveToolName = useMemo(() => getEffectiveToolName(tool), [tool]);

  return (
    <>
      {toolStatusDot(tool.state)}
      <span className="shrink-0 text-sm font-medium text-[var(--text-secondary)]">
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
      {tool.state === 'cancelled' ? (
        <span className="ml-auto shrink-0 text-sm text-status-warning">cancelled</span>
      ) : null}
    </>
  );
}
