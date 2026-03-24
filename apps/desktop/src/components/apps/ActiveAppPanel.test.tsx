// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { SeroAppManifest } from '@/types/ipc';

const federationMocks = vi.hoisted(() => {
  let resolvePreload: (() => void) | null = null;
  let preloadPromise: Promise<void> | null = null;

  return {
    reset() {
      preloadPromise = new Promise<void>((resolve) => {
        resolvePreload = resolve;
      });
    },
    resolve() {
      resolvePreload?.();
    },
    wait() {
      if (!preloadPromise) throw new Error('preload promise not initialised');
      return preloadPromise;
    },
    preloadFederatedModule: vi.fn<() => Promise<void>>(),
  };
});

vi.mock('@/lib/federation-registry', () => ({
  preloadFederatedModule: federationMocks.preloadFederatedModule,
}));

vi.mock('@/components/apps/coding/CodingWorkspace', () => ({
  CodingWorkspace: () => <div>coding workspace</div>,
}));

vi.mock('@/components/apps/SeroAppMount', () => ({
  SeroAppMount: ({ manifest }: { manifest: { id: string } }) => (
    <div>{manifest.id} remote</div>
  ),
}));

import { ActiveAppPanel } from './ActiveAppPanel';
import { useAppStore } from '@/stores/app';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createManifest(id: string, name: string): SeroAppManifest {
  return {
    id,
    name,
    description: null,
    version: '1.0.0',
    packageName: `@sero/${id}`,
    icon: 'box',
    stateFile: `.sero/apps/${id}/state.json`,
    scope: 'workspace',
    globalStatePath: null,
    uiEntry: `sero-ext://${id}/mf-manifest.json`,
    component: `${name}App`,
    devPort: 4100,
    packagePath: `/tmp/${id}`,
    isPlugin: false,
    widgets: [],
  };
}

function ActiveAppHarness() {
  const activeApp = useAppStore((s) => s.activeApp);
  return <ActiveAppPanel app={activeApp} />;
}

describe('ActiveAppPanel', () => {
  const initialAppState = useAppStore.getState();
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    federationMocks.reset();
    federationMocks.preloadFederatedModule.mockImplementation(() => federationMocks.wait());

    useAppStore.setState({
      ...initialAppState,
      activeApp: 'coding',
      pendingApp: null,
      apps: [
        ...initialAppState.apps.filter((app) => app.id !== 'todo'),
        {
          id: 'todo',
          label: 'Todo',
          icon: 'check-square',
          builtin: false,
          manifest: createManifest('todo', 'Todo'),
        },
      ],
    }, true);

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
    container.remove();
    federationMocks.preloadFederatedModule.mockReset();
    useAppStore.setState(initialAppState, true);
  });

  it('keeps rendering the previous app until the next federated app finishes preloading', async () => {
    const preload = federationMocks.wait();

    await act(async () => {
      root?.render(<ActiveAppHarness />);
    });

    expect(container.textContent).toContain('coding workspace');

    await act(async () => {
      useAppStore.getState().setActiveApp('todo');
    });

    expect(useAppStore.getState().activeApp).toBe('coding');
    expect(useAppStore.getState().pendingApp).toBe('todo');
    expect(container.textContent).toContain('coding workspace');
    expect(container.textContent).not.toContain('todo remote');

    await act(async () => {
      federationMocks.resolve();
      await preload;
    });

    expect(useAppStore.getState().activeApp).toBe('todo');
    expect(useAppStore.getState().pendingApp).toBeNull();
    expect(container.textContent).toContain('todo remote');
  });
});
