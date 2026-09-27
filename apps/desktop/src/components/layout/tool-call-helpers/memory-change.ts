import type { ChatToolCallMessage } from '@/types/ipc';

/** A save, replace or remove that the memory plugin reported in its tool details. */
export interface MemoryChange {
  action: 'save' | 'replace' | 'remove';
  id: string;
  fact: string;
}

function isChangeAction(value: unknown): value is MemoryChange['action'] {
  return value === 'save' || value === 'replace' || value === 'remove';
}

/**
 * The memory change of a finished `sero memory` call, which the chat draws as
 * one line instead of a tool row (design D13). Any other call returns null.
 */
export function readMemoryChange(tool: ChatToolCallMessage): MemoryChange | null {
  if (tool.state !== 'completed' || tool.isError) return null;
  const change = tool.details?.memoryChange;
  if (!change || typeof change !== 'object') return null;
  const { action, id, fact } = change as Record<string, unknown>;
  if (!isChangeAction(action) || typeof id !== 'string' || typeof fact !== 'string') return null;
  return { action, id, fact };
}
