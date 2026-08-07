// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstalledAgentPlugin } from '@sero-ai/common';
import { useAgentPlugins, type AgentPluginsController } from './useAgentPlugins';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

interface Snapshot { loading: boolean; busy: boolean; error: string | null }

describe('useAgentPlugins', () => {
  let container: HTMLDivElement;
  let root: Root;
  let list: ReturnType<typeof vi.fn>;
  let reveal: ReturnType<typeof vi.fn>;
  let setEnabled: ReturnType<typeof vi.fn>;
  let controller: AgentPluginsController;
  /** One entry per render, so a state that only exists mid-flight is still observed. */
  const renders: Snapshot[] = [];

  function Probe() {
    controller = useAgentPlugins();
    renders.push({ loading: controller.loading, busy: controller.busy, error: controller.error });
    return null;
  }

  /** Snapshots taken after the first list arrived. */
  const afterFirstLoad = () => renders.slice(renders.findIndex((state) => !state.loading));

  beforeEach(async () => {
    list = vi.fn(async () => [plugin]);
    reveal = vi.fn(async () => {});
    setEnabled = vi.fn(async () => plugin);
    (window as Window & { sero?: unknown }).sero = {
      agentPlugins: { list, reveal, setEnabled, onChanged: () => () => {} },
    };
    renders.length = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Probe />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('reports loading only until the first list arrives', async () => {
    expect(renders[0]?.loading).toBe(true);
    expect(controller.loading).toBe(false);
    expect(controller.plugins).toEqual([plugin]);

    const reloaded = deferred<InstalledAgentPlugin[]>();
    list.mockReturnValueOnce(reloaded.promise);
    let action!: Promise<unknown>;
    await act(async () => { action = controller.setEnabled(plugin.id, false); });

    // Mid-flight: the action is observable as busy, and the list still renders.
    expect(controller.busy).toBe(true);
    expect(controller.loading).toBe(false);

    await act(async () => { reloaded.resolve([plugin]); await action; });

    // The action reloads the list, but never re-enters loading — a second
    // loading pass unmounts the cards and closes any open details.
    expect(list).toHaveBeenCalledTimes(2);
    expect(afterFirstLoad().some((state) => state.loading)).toBe(false);
  });

  it('reveals a folder without reloading the list or blocking the surface', async () => {
    expect(list).toHaveBeenCalledTimes(1);

    const opening = deferred<void>();
    reveal.mockReturnValueOnce(opening.promise);
    let action!: Promise<unknown>;
    await act(async () => { action = controller.reveal(plugin.id, 'data'); });

    // While the file manager opens, the surface stays usable.
    expect(controller.busy).toBe(false);

    await act(async () => { opening.resolve(); await action; });

    expect(reveal).toHaveBeenCalledWith(plugin.id, 'data');
    expect(list).toHaveBeenCalledTimes(1);
    expect(afterFirstLoad().some((state) => state.busy)).toBe(false);
    expect(controller.error).toBeNull();
  });

  it('clears a failed reveal error as soon as the next attempt starts', async () => {
    reveal.mockRejectedValueOnce(new Error('Finder is unavailable'));
    await act(async () => { await controller.reveal(plugin.id, 'package'); });
    expect(controller.error).toBe('Finder is unavailable');

    const opening = deferred<void>();
    reveal.mockReturnValueOnce(opening.promise);
    let action!: Promise<unknown>;
    await act(async () => { action = controller.reveal(plugin.id, 'package'); });
    expect(controller.error).toBeNull();

    await act(async () => { opening.resolve(); await action; });
    expect(controller.error).toBeNull();
  });
});
