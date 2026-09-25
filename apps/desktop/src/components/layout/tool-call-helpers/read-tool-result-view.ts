import type { SeroToolResultViewMarker } from '@sero-ai/common';
import type { ChatToolCallMessage } from '@/types/ipc';

/** The `seroToolResultView` marker of a finished tool result, if it has a valid one. */
export function readToolResultView(tool: ChatToolCallMessage): SeroToolResultViewMarker | null {
  if (tool.state !== 'completed' && tool.state !== 'error') return null;
  const marker = tool.details?.seroToolResultView;
  if (!marker || typeof marker !== 'object') return null;
  const { appId, contributionId } = marker as Record<string, unknown>;
  return typeof appId === 'string' && typeof contributionId === 'string' ? { appId, contributionId } : null;
}
