import { describe, expect, it } from 'vitest';
import type { ChatToolCallMessage } from '@/types/ipc';
import { getFeedbackToolGroupDisposition } from './QuestionnaireNotice';

function makeTool(overrides: Partial<ChatToolCallMessage>): ChatToolCallMessage {
  return {
    type: 'tool',
    id: 'tool-1',
    toolCallId: 'call-1',
    toolName: 'sero-cli',
    input: { command: 'sero questionnaire []' },
    output: null,
    isError: false,
    state: 'completed',
    ...overrides,
  };
}

describe('getFeedbackToolGroupDisposition', () => {
  it('hides preparation-only help commands', () => {
    const disposition = getFeedbackToolGroupDisposition([
      makeTool({ input: { command: 'sero help questionnaire' } }),
    ]);

    expect(disposition).toBe('hide');
  });

  it('shows a notice for bridged questionnaire commands', () => {
    const disposition = getFeedbackToolGroupDisposition([
      makeTool({ input: { command: 'sero questionnaire [{"id":"q1"}]' }, state: 'running' }),
    ]);

    expect(disposition).toBe('notice');
  });

  it('shows a notice for direct interview tools', () => {
    const disposition = getFeedbackToolGroupDisposition([
      makeTool({ toolName: 'interview', input: { questions: [] } }),
    ]);

    expect(disposition).toBe('notice');
  });
});
