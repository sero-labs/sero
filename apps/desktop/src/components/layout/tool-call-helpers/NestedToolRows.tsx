import type { ChatToolCallMessage } from '@/types/ipc';
import { ToolRowHeader } from './ToolRowHeader';

/** The calls a tool made while it ran, one row each, in the order they started. */
export function NestedToolRows({
  tools,
  workspaceId,
}: {
  tools: ChatToolCallMessage[];
  workspaceId: string | null;
}) {
  return (
    <div className="min-w-0 border-l border-(--border-subtle)">
      {tools.map((tool) => (
        <div key={tool.toolCallId} className="flex w-full items-center gap-2 px-3 py-1">
          <ToolRowHeader tool={tool} workspaceId={workspaceId} />
        </div>
      ))}
    </div>
  );
}
