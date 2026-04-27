import { useCallback, useMemo, type MouseEvent } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import { useEditorBridge } from '@/stores/editor-bridge';
import { looksLikeFilePath, toEditorVirtualPath } from '../ClickableFilePath';

const FILE_PATH_TOOLS = new Set(['edit', 'read', 'write']);

interface ToolSummaryTextProps {
  summary: string;
  toolName: string;
  workspaceId: string | null;
  hasLiveProgress: boolean;
}

export function ToolSummaryText({
  summary,
  toolName,
  workspaceId,
  hasLiveProgress,
}: ToolSummaryTextProps) {
  const requestOpenFile = useEditorBridge((state) => state.requestOpenFile);
  const isFilePath = useMemo(
    () => !hasLiveProgress && FILE_PATH_TOOLS.has(toolName) && looksLikeFilePath(summary),
    [hasLiveProgress, summary, toolName],
  );

  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !isFilePath || !workspaceId) return;
      event.preventDefault();
      event.stopPropagation();
      requestOpenFile(workspaceId, toEditorVirtualPath(summary));
    },
    [isFilePath, requestOpenFile, summary, workspaceId],
  );

  return (
    <span
      onClick={handleClick}
      className={cn(
        'min-w-0 truncate text-[11px] text-[var(--text-secondary)]',
        isFilePath &&
          workspaceId &&
          'cursor-pointer underline decoration-dotted decoration-[var(--text-muted)]/60 underline-offset-2 hover:text-[var(--text-primary)] hover:decoration-[var(--accent-primary)]',
      )}
      title={isFilePath ? 'Ctrl+click to open in editor' : undefined}
    >
      {summary}
    </span>
  );
}
