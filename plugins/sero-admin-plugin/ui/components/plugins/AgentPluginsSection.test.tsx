// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentPluginInspection, InstalledAgentPlugin } from '@sero-ai/common';
import type { AgentPluginsController } from '../../hooks/useAgentPlugins';
import { AgentPluginCard } from './AgentPluginCard';
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

const plugin = {
  id: 'ap-example',
  manifest: { $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'Example' },
  source: 'npm:example',
  sourceKind: 'npm',
  contentDigest: 'digest',
  installedAt: '2026-08-07T12:00:00.000Z',
  updatedAt: '2026-08-07T12:00:00.000Z',
  packagePath: '/plugins/ap-example',
  dataPath: '/data/ap-example',
  enabled: true,
  mcpApprovalHash: null,
  skills: [],
  mcpServers: [],
  diagnostics: [],
  cli: { enabled: false, namespace: 'example', skillCommands: [], mcpCommands: [] },
} satisfies InstalledAgentPlugin;

function createController(inspect: AgentPluginsController['inspect']): AgentPluginsController {
  return {
    plugins: [], inspection: null, updatePreview: null, loading: false, busy: false, error: null,
    clearInspection: () => {},
    clearUpdatePreview: () => {},
    inspect,
    install: async () => null,
    setEnabled: async () => null,
    approve: async () => null,
    setCliExposure: async () => null,
    previewUpdate: async () => null,
    update: async () => null,
    remove: async () => null,
    reveal: async () => {},
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

  it('shows progress while it previews a source', async () => {
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

    const previewButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Preview');
    expect(previewButton).toBeDefined();

    await act(async () => previewButton?.click());

    expect(inspect).toHaveBeenCalledWith('https://github.com/agentplugins/agent-plugins-example');
    expect(previewButton?.textContent).toBe('Previewing…');
    expect(previewButton?.querySelector('.animate-spin')).not.toBeNull();
    expect(input?.disabled).toBe(true);

    await act(async () => pending.resolve(null));

    expect(previewButton?.textContent).toBe('Preview');
    expect(input?.disabled).toBe(false);
  });

  it('removes a plugin only after the dialog is confirmed, and carries the data choice', async () => {
    const remove = vi.fn(async () => null);
    const controller = { ...createController(async () => null), plugins: [plugin], remove };

    await act(async () => root.render(<AgentPluginCard plugin={plugin} controller={controller} focused />));

    const findButton = (label: string) => [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === label);

    await act(async () => findButton('Remove')?.click());
    expect(remove).not.toHaveBeenCalled();

    const retain = document.querySelector<HTMLButtonElement>(`#${plugin.id}-retain-data`);
    expect(retain?.dataset.state).toBe('checked');
    await act(async () => retain?.click());

    await act(async () => findButton('Remove plugin')?.click());
    expect(remove).toHaveBeenCalledWith({ id: plugin.id, retainData: false });
  });
});
