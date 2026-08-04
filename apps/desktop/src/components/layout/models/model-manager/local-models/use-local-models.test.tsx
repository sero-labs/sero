// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LocalModelsConfig,
  LocalModelsSaveResult,
} from '@/types/local-models';
import { useLocalModels, type UseLocalModelsReturn } from './use-local-models';

const getConfig = vi.fn<() => Promise<LocalModelsConfig>>();
const saveConfig = vi.fn<(config: LocalModelsConfig) => Promise<LocalModelsSaveResult>>();
let latestState: UseLocalModelsReturn | null = null;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  latestState = useLocalModels();
  return null;
}

describe('useLocalModels', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    latestState = null;
    getConfig.mockReset();
    saveConfig.mockReset();
    getConfig.mockResolvedValue({ providers: {} });
    saveConfig.mockResolvedValue({
      warning: 'Availability refresh: network unavailable',
    });
    Object.defineProperty(window, 'sero', {
      configurable: true,
      value: {
        localModels: {
          getConfig,
          saveConfig,
        },
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
  });

  it('keeps the saved config and exposes refresh failures as warnings', async () => {
    await act(async () => {
      root?.render(<Harness />);
    });
    await act(async () => {
      await latestState?.reload();
    });
    await act(async () => {
      await latestState?.addProvider('local', {
        baseUrl: 'http://localhost:11434/v1',
        api: 'openai-completions',
      });
    });

    expect(saveConfig).toHaveBeenCalledWith({
      providers: {
        local: {
          baseUrl: 'http://localhost:11434/v1',
          api: 'openai-completions',
        },
      },
    });
    expect(latestState?.config).toEqual({
      providers: {
        local: {
          baseUrl: 'http://localhost:11434/v1',
          api: 'openai-completions',
        },
      },
    });
    expect(latestState?.warning).toBe('Availability refresh: network unavailable');
    expect(latestState?.error).toBeNull();
  });
});
