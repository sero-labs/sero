// @vitest-environment jsdom

import { AppProvider } from '@sero-ai/app-runtime';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    Reflect.deleteProperty(window, 'sero');
  });

  function installSeroBridge(invokeTool: ReturnType<typeof vi.fn>) {
    Reflect.set(window, 'sero', {
      appState: {
        read: vi.fn(async () => null),
        write: vi.fn(async () => undefined),
        watch: vi.fn(async () => null),
        unwatch: vi.fn(async () => undefined),
        onChange: vi.fn(() => () => undefined),
      },
      appAgent: {
        invokeTool,
      },
    });
  }

  async function renderPanel(
    state: KanbanState,
    onUpdate: (updater: (state: KanbanState) => KanbanState) => void,
    invokeTool = vi.fn(async () => ({
      text: 'ok',
      content: [{ type: 'text' as const, text: 'ok' }],
      details: {},
      isError: false,
    })),
  ) {
    installSeroBridge(invokeTool);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AppProvider value={{ appId: 'kanban', workspaceId: 'workspace-1', workspacePath: '/tmp', stateFilePath: '/tmp/state.json' }}>
          <SettingsPanel
            open
            settings={state.settings}
            onClose={() => undefined}
            onUpdate={onUpdate}
          />
        </AppProvider>,
      );
    });

    return invokeTool;
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

  it('routes yolo mode updates through the kanban settings tool instead of local reducers', async () => {
    const onUpdate = vi.fn();
    const invokeTool = await renderPanel(
      DEFAULT_KANBAN_STATE,
      onUpdate,
      vi.fn(async () => ({
        text: 'YOLO mode ON — full auto, no human gates',
        content: [{ type: 'text' as const, text: 'YOLO mode ON — full auto, no human gates' }],
        details: {},
        isError: false,
      })),
    );

    await act(async () => {
      clickButton('YOLO Mode');
    });

    expect(onUpdate).not.toHaveBeenCalled();
    expect(invokeTool).toHaveBeenCalledWith('kanban', 'workspace-1', 'kanban', {
      action: 'settings',
      setting: 'yoloMode',
      value: 'true',
    });
  });
});
