// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

import type { KanbanState } from '../../shared/types';
import { DEFAULT_KANBAN_STATE } from '../../shared/types';
import { SettingsPanel } from './SettingsPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('SettingsPanel', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container.remove();
    root = null;
  });

  async function renderPanel(state: KanbanState, onUpdate: (updater: (state: KanbanState) => KanbanState) => void) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <SettingsPanel
          open
          settings={state.settings}
          onClose={() => undefined}
          onUpdate={onUpdate}
        />,
      );
    });
  }

  function clickButton(label: string): void {
    const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(label));
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Button not found: ${label}`);
    }
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  it('surfaces the runtime-backed auto-merge and read-only auto-advance settings', async () => {
    const state: KanbanState = {
      ...DEFAULT_KANBAN_STATE,
      settings: {
        ...DEFAULT_KANBAN_STATE.settings,
        yoloMode: true,
        yoloAutoMergePrs: true,
        testingEnabled: false,
      },
    };

    await renderPanel(state, () => undefined);

    expect(container.textContent).toContain('PR Auto-Merge');
    expect(container.textContent).toContain('Auto Advance');
    expect(container.textContent).toContain('Enabled by the runtime');
    expect(container.textContent).toContain('Review Mode');
  });

  it('writes yolo mode updates through the shared updater path', async () => {
    const updatedStates: KanbanState[] = [];
    await renderPanel(DEFAULT_KANBAN_STATE, (updater) => {
      updatedStates.push(updater(DEFAULT_KANBAN_STATE));
    });

    await act(async () => {
      clickButton('YOLO Mode');
    });

    expect(updatedStates).toHaveLength(1);
    expect(updatedStates[0]?.settings.yoloMode).toBe(true);
  });
});
