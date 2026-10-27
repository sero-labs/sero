// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { SeroUserFeedbackBridge, UserFeedbackPendingQuestion } from '@sero-ai/common';
import { BoardRequests } from '../components/BoardRequests';
import { FIXTURES } from '../__preview__/fixture';

it('hydrates a real pending request, answers its ID, and removes it on host cancellation', async () => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  const request: UserFeedbackPendingQuestion = { id: 'grant-1', toolCallId: 'host', type: 'question', timestamp: new Date().toISOString(), context: { workspaceId: FIXTURES.build!.workspaceId! }, questions: [{ id: 'q0', label: 'Access', prompt: 'Allow this work?', options: [{ value: 'allow', label: 'Allow' }], allowOther: false }] };
  let cancel: (data: { id: string }) => void = () => {};
  const bridge: SeroUserFeedbackBridge = {
    getPending: async () => [request, { ...request, id: 'unrelated', context: { workspaceId: 'other' } }],
    onQuestion: () => () => {}, onCancel: (callback) => { cancel = callback; return () => {}; },
    answer: vi.fn(async (response) => cancel({ id: response.id })),
  };
  Reflect.set(window, 'sero', { appState: {}, appAgent: {}, userFeedback: bridge });
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<BoardRequests record={FIXTURES.build!} />));
    expect(container.querySelectorAll('article')).toHaveLength(1);
    await act(async () => container.querySelector('button')?.click());
    expect(bridge.answer).toHaveBeenCalledWith({ id: 'grant-1', cancelled: false, answers: [{ questionId: 'q0', value: 'allow', label: 'Allow', wasCustom: false }] });
    expect(container.textContent).toBe('');
  } finally {
    await act(async () => root.unmount());
    Reflect.deleteProperty(window, 'sero');
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
