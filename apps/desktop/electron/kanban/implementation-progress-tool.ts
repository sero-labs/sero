import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

const MarkSubtaskCompleteParams = Type.Object({
  subtaskId: Type.String({
    description: 'Planner subtask ID that has just been completed for the current card.',
  }),
});

export interface ImplementationProgressToolHandlers {
  markSubtaskComplete: (subtaskId: string) => Promise<'recorded' | 'duplicate'>;
}

export function createImplementationProgressTool(
  handlers: ImplementationProgressToolHandlers,
): ToolDefinition {
  return {
    name: 'kanban_mark_subtask_complete',
    label: 'Kanban Mark Subtask Complete',
    description:
      'Record completion of a planned kanban subtask for the current implementation card. Call this immediately when a subtask is done, before starting the next one, and never batch several completions at the end.',
    parameters: MarkSubtaskCompleteParams,
    async execute(_toolCallId, params) {
      const subtaskId = String((params as { subtaskId: string }).subtaskId ?? '').trim();
      if (!subtaskId) {
        throw new Error('subtaskId is required');
      }

      const outcome = await handlers.markSubtaskComplete(subtaskId);
      const text = outcome === 'duplicate'
        ? `Subtask ${subtaskId} was already recorded as complete.`
        : `Recorded completion for subtask ${subtaskId}.`;

      return {
        content: [{ type: 'text', text }],
        details: { subtaskId, outcome },
      };
    },
  };
}
