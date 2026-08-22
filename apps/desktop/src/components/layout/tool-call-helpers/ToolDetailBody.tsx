import type { ChatToolCallMessage } from '@/types/ipc';
import { ToolCallProgress, buildToolProgressModel } from '../ToolCallProgress';
import { ClampedText } from './ClampedText';
import { StreamingFileWrite } from './StreamingFileWrite';
import { ToolFileLinks } from './ToolFileLinks';
import { ToolImages } from './ToolImages';
import { ToolInputRows } from './ToolInputRows';

/**
 * Flat detail for one tool call: arguments, live input or progress, media and
 * output. No card, no header, no scroll box — the layout around it supplies
 * the frame and the tool identity.
 */
export function ToolDetailBody({
  tool,
  workspaceId = null,
}: {
  tool: ChatToolCallMessage;
  workspaceId?: string | null;
}) {
  const progress = buildToolProgressModel(tool);
  const output = typeof tool.output === 'string' && tool.output.trim().length > 0 ? tool.output : null;

  return (
    <div className="min-w-0 space-y-3">
      {tool.isStreamingInput ? (
        <StreamingFileWrite tool={tool} />
      ) : (
        <ToolInputRows input={tool.input} />
      )}

      {progress ? <ToolCallProgress tool={tool} /> : null}

      {tool.images?.length ? <ToolImages images={tool.images} workspaceId={workspaceId} /> : null}
      <ToolFileLinks details={tool.details} workspaceId={workspaceId} className="py-1" />

      {/* A progress model already renders the live output text. */}
      {output && !progress ? (
        <div className="space-y-1">
          <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
            {tool.isError ? 'error' : 'output'}
          </span>
          <ClampedText text={output} tone={tool.isError ? 'error' : 'default'} />
        </div>
      ) : null}
    </div>
  );
}
