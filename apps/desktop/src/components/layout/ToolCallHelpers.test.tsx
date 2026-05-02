import { describe, expect, it } from 'vitest';
import type { ChatToolCallMessage } from '@/types/ipc';
import { getCollapsedToolSummary } from './ToolCallState';

function makeTool(overrides: Partial<ChatToolCallMessage>): ChatToolCallMessage {
  return {
    type: 'tool',
    id: 'tool-1',
    toolCallId: 'call-1',
    toolName: 'sero-cli',
    input: {
      command: 'sero memory replace --target memory --entry_id "mem-1" --content "updated"',
    },
    output: 'Replaced entry mem-1 in MEMORY.md',
    isError: false,
    state: 'completed',
    details: null,
    isPartialOutput: false,
    ...overrides,
  };
}

describe('getCollapsedToolSummary', () => {
  it('prefers the completed sero-cli result text over the raw command', () => {
    expect(getCollapsedToolSummary(makeTool({}))).toBe('Replaced entry mem-1 in MEMORY.md');
  });

  it('falls back to the command text while the tool is still running', () => {
    expect(getCollapsedToolSummary(makeTool({
      state: 'running',
      output: 'Working...',
      isPartialOutput: true,
    }))).toBe('sero memory replace --target memory --entry_id "mem-1" --content "updated"');
  });
});
