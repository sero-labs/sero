import { useMemo } from 'react';
import { motion } from 'motion/react';
import type { ChatToolCallMessage } from '@/types/ipc';
import {
  buildToolProgressModel,
  getEffectiveToolName,
} from '../ToolCallProgress';
import { getCollapsedToolSummary, toolStatusDot } from '../ToolCallState';
import { ToolSummaryText } from './ToolSummaryText';

export function ToolLine({
  tool,
  index,
  workspaceId,
}: {
  tool: ChatToolCallMessage;
  index: number;
  workspaceId: string | null;
}) {
  const progressModel = useMemo(() => buildToolProgressModel(tool), [tool]);
  const summary = useMemo(() => getCollapsedToolSummary(tool), [tool]);
  const effectiveToolName = useMemo(() => getEffectiveToolName(tool), [tool]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: index * 0.03 }}
      className="px-3 py-1 text-xs"
    >
      <div className="flex items-center gap-2">
        {toolStatusDot(tool.state)}
        <span className="shrink-0 font-medium text-[var(--text-muted)]">
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
      </div>
    </motion.div>
  );
}
