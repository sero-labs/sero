// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentPluginInspection } from '@sero-ai/common';
import type { AgentPluginsController } from '../../hooks/useAgentPlugins';
import { AgentPluginsSection } from './AgentPluginsSection';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createController(inspect: AgentPluginsController['inspect']): AgentPluginsController {
  return {
    plugins: [], inspection: null, updatePreview: null, loading: false, busy: false, error: null,
    clearInspection: () => {},
    inspect,
    install: async () => null,
    setEnabled: async () => null,
    approve: async () => null,
    setCliExposure: async () => null,
    previewUpdate: async () => null,
    update: async () => null,
    remove: async () => null,
    reveal: async () => null,
  };
}

describe('AgentPluginsSection', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('shows progress while it inspects a source', async () => {
    const pending = deferred<AgentPluginInspection | null>();
    const inspect = vi.fn(() => pending.promise);

    await act(async () => root.render(<AgentPluginsSection controller={createController(inspect)} />));

    const input = container.querySelector('input');
    expect(input).not.toBeNull();
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, 'https://github.com/agentplugins/agent-plugins-example');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const inspectButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Inspect source');
    expect(inspectButton).toBeDefined();

    await act(async () => inspectButton?.click());

    expect(inspect).toHaveBeenCalledWith('https://github.com/agentplugins/agent-plugins-example');
    expect(inspectButton?.textContent).toBe('Inspecting source…');
    expect(inspectButton?.querySelector('.animate-spin')).not.toBeNull();
    expect(input?.disabled).toBe(true);

    await act(async () => pending.resolve(null));

    expect(inspectButton?.textContent).toBe('Inspect source');
    expect(input?.disabled).toBe(false);
  });
});
