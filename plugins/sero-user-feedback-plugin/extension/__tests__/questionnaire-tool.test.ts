import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  askQuestion: vi.fn(),
  hasSeroIPCBridge: vi.fn(() => true),
  nextQuestionId: vi.fn(() => 'pending-1'),
}));

vi.mock('../ipc-bridge', () => bridge);

import userFeedback from '../index';

describe('questionnaire tool', () => {
  let questionnaire: ToolDefinition;

  beforeEach(() => {
    bridge.askQuestion.mockReset();
    const definitions = new Map<string, ToolDefinition>();
    const pi = {
      registerTool: (definition: ToolDefinition) => definitions.set(definition.name, definition),
      registerCommand: () => {},
      on: () => {},
    } as unknown as ExtensionAPI;
    userFeedback(pi);
    const definition = definitions.get('questionnaire');
    if (!definition) throw new Error('Questionnaire tool was not registered');
    questionnaire = definition;
  });

  it.each([
    {
      caseName: 'a wrapped question set',
      params: { questions: [{ questions: [{ id: 'agent_name', prompt: 'What should the AI call itself?', options: [] }] }] },
    },
    {
      caseName: 'a blank prompt',
      params: { questions: [{ id: 'agent_name', prompt: ' ', options: [] }] },
    },
  ])('rejects $caseName before opening user feedback', async ({ params }) => {

    const result = await questionnaire.execute(
      'call-1', params as Parameters<typeof questionnaire.execute>[1], new AbortController().signal, () => {},
      { hasUI: false } as Parameters<typeof questionnaire.execute>[4],
    );

    expect(result.content).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('Pass the array directly') }),
    ]);
    expect(bridge.askQuestion).not.toHaveBeenCalled();
  });

  it('opens the form with the prompt and choices from a valid question', async () => {
    bridge.askQuestion.mockResolvedValue({ answers: [], cancelled: true });
    const params = {
      questions: [{
        id: 'agent_name',
        prompt: 'What should the AI call itself?',
        options: [{ label: 'Sero' }],
      }],
    };

    await questionnaire.execute(
      'call-2', params, new AbortController().signal, () => {},
      { hasUI: false } as Parameters<typeof questionnaire.execute>[4],
    );

    expect(bridge.askQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        questions: [expect.objectContaining({
          prompt: 'What should the AI call itself?',
          options: [expect.objectContaining({ label: 'Sero' })],
        })],
      }),
      expect.any(AbortSignal),
    );
  });
});
