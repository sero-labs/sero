import type { ChatToolCallMessage } from '@/types/ipc';
import { ClampedText } from './ClampedText';
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
        <div key={tool.toolCallId} className="min-w-0 px-3 py-1">
          <div className="flex w-full items-center gap-2">
            <ToolRowHeader tool={tool} workspaceId={workspaceId} />
          </div>
          {/* The header shows the arguments. A failed call also says why it failed. */}
          {tool.state === 'error' && tool.output ? (
            <div className="mt-1">
              <ClampedText text={tool.output} lineLimit={3} tone="error" />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
