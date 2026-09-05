/**
 * Tool-call state helpers, copied from the desktop `ToolCallState.tsx`
 * and mapped onto the gateway's own state names.
 */

import type { ToolCall } from '@/stores/chat';

/** `ai-elements/tool` state names. */
export type ToolUIState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error'
  | 'output-denied';

export function mapToolState(state: ToolCall['state']): ToolUIState {
  switch (state) {
    case 'streaming':
      return 'input-streaming';
    case 'running':
      return 'input-available';
    case 'done':
      return 'output-available';
    case 'error':
      return 'output-error';
    case 'cancelled':
      return 'output-denied';
  }
}

export type GroupStatus = 'running' | 'completed' | 'error' | 'cancelled';

export function deriveGroupStatus(toolCalls: ToolCall[]): GroupStatus {
  const hasRunning = toolCalls.some(
    (tool) => tool.state === 'streaming' || tool.state === 'running' || tool.isStreamingInput,
  );
  const hasCancelled = toolCalls.some((tool) => tool.state === 'cancelled');
  const hasError = toolCalls.some((tool) => tool.state === 'error');

  if (hasRunning) return 'running';
  if (hasCancelled) return 'cancelled';
  if (hasError) return 'error';
  return 'completed';
}

export function groupStatusLabel(status: GroupStatus, count: number): string {
  const noun = count === 1 ? 'action' : 'actions';
  switch (status) {
    case 'running':
      return `Running ${count} ${noun}...`;
    case 'completed':
      return `${count} ${noun} completed`;
    case 'error':
      return `${count} ${noun}`;
    case 'cancelled':
      return `${count} ${noun} (cancelled)`;
  }
}
