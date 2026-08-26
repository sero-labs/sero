// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalProviderConfig } from '@/types/local-models';
import {
  useLocalProviderFormState,
  type UseLocalProviderFormStateOptions,
} from './useLocalProviderFormState';

const onSaveSpy = vi.fn<(name: string, config: LocalProviderConfig) => Promise<void>>();
const onTestConnectionSpy = vi.fn<UseLocalProviderFormStateOptions['onTestConnection']>();
const onFetchModelsSpy = vi.fn<UseLocalProviderFormStateOptions['onFetchModels']>();

let hookOptions: UseLocalProviderFormStateOptions;
let latestState: ReturnType<typeof useLocalProviderFormState> | null = null;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  latestState = useLocalProviderFormState(hookOptions);
  return null;
}

describe('useLocalProviderFormState', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    latestState = null;
    onSaveSpy.mockReset();
    onTestConnectionSpy.mockReset();
    onFetchModelsSpy.mockReset();
    onSaveSpy.mockResolvedValue(undefined);
    onTestConnectionSpy.mockResolvedValue({ ok: true });
    onFetchModelsSpy.mockResolvedValue([]);
    hookOptions = {
      existing: null,
      existingNames: [],
      onSave: onSaveSpy,
      onTestConnection: onTestConnectionSpy,
      onFetchModels: onFetchModelsSpy,
    };
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

  it('applies presets and resets connection status after a failed test', async () => {
    onTestConnectionSpy.mockResolvedValueOnce({ ok: false, error: 'Server offline' });

    await act(async () => {
      root?.render(<Harness />);
    });

    act(() => {
      latestState?.handleNameChange('ollama');
      latestState?.handleBaseUrlChange('http://localhost:9999/v1');
    });

    await act(async () => {
      await latestState?.handleTestConnection();
    });

    expect(latestState?.connectionStatus).toBe('error');
    expect(latestState?.connectionError).toBe('Server offline');

    act(() => {
      latestState?.applyPreset('vllm');
    });

    expect(latestState?.name).toBe('vllm');
    expect(latestState?.baseUrl).toBe('http://localhost:8000/v1');
    expect(latestState?.authentication).toBe('none');
    expect(latestState?.apiKey).toBe('');
    expect(latestState?.supportsDeveloperRole).toBe(false);
    expect(latestState?.supportsReasoningEffort).toBe(false);
    expect(latestState?.connectionStatus).toBe('idle');
    expect(latestState?.connectionError).toBeNull();
  });

  it('reuses advanced connection settings and deduplicates fetched models', async () => {
    hookOptions = {
      ...hookOptions,
      existing: {
        name: 'custom-provider',
        config: {
          baseUrl: 'http://localhost:1234/v1',
          api: 'openai-completions',
          apiKey: 'secret',
          headers: { Authorization: 'Bearer test' },
          authHeader: true,
          models: [{ id: 'llama3' }],
        },
      },
    };
    onFetchModelsSpy.mockResolvedValueOnce([
      { id: 'llama3' },
      { id: 'qwen3', name: 'Qwen 3' },
    ]);

    await act(async () => {
      root?.render(<Harness />);
    });

    await act(async () => {
      await latestState?.handleTestConnection();
    });

    expect(onTestConnectionSpy).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:1234/v1',
      api: 'openai-completions',
      apiKey: 'secret',
      headers: { Authorization: 'Bearer test' },
      authHeader: true,
    });

    await act(async () => {
      await latestState?.handleFetchModels();
    });

    expect(latestState?.models).toEqual([
      { id: 'llama3' },
      { id: 'qwen3', name: 'Qwen 3' },
    ]);

    act(() => {
      latestState?.handleNewModelIdChange('qwen3');
    });
    act(() => {
      latestState?.handleAddModel();
    });
    expect(latestState?.models).toEqual([
      { id: 'llama3' },
      { id: 'qwen3', name: 'Qwen 3' },
    ]);

    act(() => {
      latestState?.handleNewModelIdChange('mistral');
    });
    act(() => {
      latestState?.handleAddModel();
    });
    act(() => {
      latestState?.handleRemoveModel('llama3');
    });
    expect(latestState?.models).toEqual([
      { id: 'qwen3', name: 'Qwen 3' },
      { id: 'mistral' },
    ]);
  });

  it('blocks duplicate provider names on create', async () => {
    hookOptions = {
      ...hookOptions,
      existingNames: ['ollama'],
    };

    await act(async () => {
      root?.render(<Harness />);
    });

    act(() => {
      latestState?.handleNameChange('Ollama');
      latestState?.handleBaseUrlChange('http://localhost:11434/v1');
    });

    await act(async () => {
      await latestState?.handleSave();
    });

    expect(onSaveSpy).not.toHaveBeenCalled();
    expect(latestState?.saveError).toBe('Provider "ollama" already exists');
  });

  it('preserves advanced config while saving edited providers', async () => {
    hookOptions = {
      ...hookOptions,
      existing: {
        name: 'studio',
        config: {
          baseUrl: ' http://localhost:1234/v1 ',
          api: 'openai-completions',
          apiKey: ' token ',
          headers: { 'X-Test': '1' },
          authHeader: true,
          compat: { supportsDeveloperRole: false },
          models: [{ id: 'qwen3' }],
        },
      },
    };

    await act(async () => {
      root?.render(<Harness />);
    });

    act(() => {
      latestState?.handleSupportsReasoningEffortChange(false);
      latestState?.handleBaseUrlChange('http://localhost:1234/v1');
      latestState?.handleApiKeyChange('token');
    });

    await act(async () => {
      await latestState?.handleSave();
    });

    expect(onSaveSpy).toHaveBeenCalledWith('studio', {
      baseUrl: 'http://localhost:1234/v1',
      api: 'openai-completions',
      apiKey: 'token',
      headers: { 'X-Test': '1' },
      authHeader: true,
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
      },
      models: [{ id: 'qwen3' }],
    });
  });

  it('maps keyless and command authentication without exposing placeholders', async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    act(() => {
      latestState?.handleNameChange('local');
      latestState?.handleBaseUrlChange('http://localhost:30000/v1');
    });

    await act(async () => {
      await latestState?.handleTestConnection();
      await latestState?.handleSave();
    });

    expect(onTestConnectionSpy).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: undefined,
    }));
    expect(onSaveSpy).toHaveBeenCalledWith('local', expect.objectContaining({
      apiKey: 'none',
    }));

    act(() => {
      latestState?.handleAuthenticationChange('api-key');
    });
    expect(latestState?.isValid).toBe(false);

    act(() => {
      latestState?.handleApiKeySourceChange('command');
      latestState?.handleApiKeyChange('get-local-key');
    });

    await act(async () => {
      await latestState?.handleTestConnection();
    });

    expect(onTestConnectionSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      apiKey: '!get-local-key',
    }));

    act(() => {
      latestState?.handleApiKeySourceChange('environment');
      latestState?.handleApiKeyChange('LOCAL_MODEL_KEY');
    });
    await act(async () => {
      await latestState?.handleSave();
    });
    expect(onSaveSpy).toHaveBeenLastCalledWith('local', expect.objectContaining({
      apiKey: '$LOCAL_MODEL_KEY',
    }));
  });

  it('applies the SGLang thinking format and updates one model', async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    act(() => {
      latestState?.applyPreset('sglang');
      latestState?.handleNewModelIdChange('Qwen/Qwen3-32B');
    });
    act(() => {
      latestState?.handleAddModel();
    });
    act(() => {
      latestState?.handleNewModelIdChange('Qwen/Qwen3-8B');
    });
    act(() => {
      latestState?.handleAddModel();
    });
    act(() => {
      latestState?.handleUpdateModel('Qwen/Qwen3-32B', {
        id: 'Qwen/Qwen3-32B',
        reasoning: true,
        thinkingLevelMap: { low: 'low', medium: 'medium', max: null },
      });
    });

    await act(async () => {
      await latestState?.handleSave();
    });

    expect(onSaveSpy).toHaveBeenCalledWith('sglang', expect.objectContaining({
      apiKey: 'none',
      compat: expect.objectContaining({
        thinkingFormat: 'qwen-chat-template',
      }),
      models: [
        {
          id: 'Qwen/Qwen3-32B',
          reasoning: true,
          thinkingLevelMap: { low: 'low', medium: 'medium', max: null },
        },
        { id: 'Qwen/Qwen3-8B' },
      ],
    }));
  });

  it('preserves escaped literal authentication values', async () => {
    hookOptions = {
      ...hookOptions,
      existing: {
        name: 'escaped-key',
        config: {
          baseUrl: 'http://localhost:8080/v1',
          api: 'openai-completions',
          apiKey: '$$literal-key',
          models: [{ id: 'local-model' }],
        },
      },
    };

    await act(async () => {
      root?.render(<Harness />);
    });

    expect(latestState?.apiKeySource).toBe('literal');
    expect(latestState?.apiKey).toBe('$$literal-key');

    await act(async () => {
      await latestState?.handleSave();
    });

    expect(onSaveSpy).toHaveBeenCalledWith('escaped-key', expect.objectContaining({
      apiKey: '$$literal-key',
    }));
  });
});
