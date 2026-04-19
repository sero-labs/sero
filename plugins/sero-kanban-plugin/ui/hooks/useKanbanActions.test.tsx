// @vitest-environment jsdom

import { AppProvider } from '@sero-ai/app-runtime';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useKanbanActions } from './useKanbanActions';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type UpdateSettingFn = ReturnType<typeof useKanbanActions>['updateSetting'];

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

describe('useKanbanActions', () => {
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

  async function renderProbe(invokeTool: ReturnType<typeof vi.fn>): Promise<{ updateSetting: UpdateSettingFn }> {
    installSeroBridge(invokeTool);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    let updateSetting: UpdateSettingFn | null = null;

    function Probe() {
      const actions = useKanbanActions();
      updateSetting = actions.updateSetting;

      return (
        <div
          data-pending-yolo={String(actions.isSettingPending('yoloMode'))}
          data-pending-review={String(actions.isSettingPending('reviewMode'))}
          data-error={actions.settingsError ?? ''}
        />
      );
    }

    await act(async () => {
      root?.render(
        <AppProvider value={{ appId: 'kanban', workspaceId: 'workspace-1', workspacePath: '/tmp', stateFilePath: '/tmp/state.json' }}>
          <Probe />
        </AppProvider>,
      );
    });

    if (!updateSetting) {
      throw new Error('Failed to capture useKanbanActions updateSetting');
    }

    const capturedUpdateSetting = updateSetting;
    return { updateSetting: capturedUpdateSetting };
  }

  it('calls the kanban settings tool with stringified values and tracks pending state', async () => {
    const deferred = createDeferred<{
      text: string;
      content: { type: 'text'; text: string }[];
      details: Record<string, never>;
      isError: boolean;
    }>();
    const invokeTool = vi.fn(async () => deferred.promise);
    const { updateSetting } = await renderProbe(invokeTool);

    let resultPromise: ReturnType<UpdateSettingFn> | null = null;
    await act(async () => {
      resultPromise = updateSetting('yoloMode', true);
    });

    expect(invokeTool).toHaveBeenCalledWith('kanban', 'workspace-1', 'kanban', {
      action: 'settings',
      setting: 'yoloMode',
      value: 'true',
    });
    expect(container.firstElementChild?.getAttribute('data-pending-yolo')).toBe('true');

    deferred.resolve({
      text: 'YOLO mode ON — full auto, no human gates',
      content: [{ type: 'text', text: 'YOLO mode ON — full auto, no human gates' }],
      details: {},
      isError: false,
    });

    if (!resultPromise) {
      throw new Error('Expected updateSetting to return a promise');
    }

    let result: Awaited<ReturnType<UpdateSettingFn>> | null = null;
    await act(async () => {
      result = await resultPromise;
    });

    expect(result).toEqual({ ok: true, message: 'YOLO mode ON — full auto, no human gates' });
    expect(container.firstElementChild?.getAttribute('data-pending-yolo')).toBe('false');
    expect(container.firstElementChild?.getAttribute('data-error')).toBe('');
  });

  it('stores tool errors so the UI can surface failed runtime-backed updates', async () => {
    const invokeTool = vi.fn(async () => ({
      text: 'Error: Light review mode is only available in Prototype mode. Disable testing first.',
      content: [{ type: 'text' as const, text: 'Error: Light review mode is only available in Prototype mode. Disable testing first.' }],
      details: {},
      isError: true,
    }));
    const { updateSetting } = await renderProbe(invokeTool);

    let result: Awaited<ReturnType<UpdateSettingFn>> | null = null;
    await act(async () => {
      result = await updateSetting('reviewMode', 'light');
    });

    expect(result).toEqual({
      ok: false,
      message: 'Error: Light review mode is only available in Prototype mode. Disable testing first.',
    });
    expect(container.firstElementChild?.getAttribute('data-pending-review')).toBe('false');
    expect(container.firstElementChild?.getAttribute('data-error')).toBe(
      'Error: Light review mode is only available in Prototype mode. Disable testing first.',
    );
  });
});
