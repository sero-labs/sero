// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalModelEntry } from '@/types/local-models';
import { LocalModelEditor } from './LocalModelEditor';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe('LocalModelEditor', () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];
  const containers: HTMLDivElement[] = [];

  afterEach(async () => {
    await act(async () => {
      for (const root of roots) root.unmount();
    });
    for (const container of containers) container.remove();
    roots.length = 0;
    containers.length = 0;
  });

  it('preserves advanced fields when it saves edited model fields', async () => {
    const model: LocalModelEntry = {
      id: 'Qwen/Qwen3-32B',
      name: 'Qwen3 32B',
      reasoning: true,
      thinkingLevelMap: { low: 'low', medium: 'medium', max: null },
      input: ['text'],
      contextWindow: 32768,
      maxTokens: 8192,
      cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2 },
      headers: { 'X-Test': '$MODEL_HEADER' },
      samplingParams: { temperature: 0.6, top_p: 0.9 },
      compat: { requiresToolResultName: true },
    };
    const onSave = vi.fn<(next: LocalModelEntry) => void>();
    const container = document.createElement('div');
    document.body.appendChild(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <LocalModelEditor
          model={model}
          thinkingFormat="qwen-chat-template"
          onCancel={vi.fn()}
          onSave={onSave}
        />,
      );
    });

    const saveButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Save Model');
    if (!saveButton) throw new Error('Save Model button not found');

    act(() => {
      saveButton.click();
    });

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      cost: model.cost,
      headers: model.headers,
      samplingParams: model.samplingParams,
      compat: model.compat,
      thinkingLevelMap: expect.objectContaining(model.thinkingLevelMap),
    }));
  });
});
