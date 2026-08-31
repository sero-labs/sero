// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { SeroAppManifest } from '@/types/ipc';

const federationMocks = vi.hoisted(() => ({
  getFederatedComponent: vi.fn(),
}));
const runtimeMocks = vi.hoisted(() => ({
  useAppRuntimeMount: vi.fn((manifest: SeroAppManifest) => ({
    contextValue: {
      appId: manifest.id,
      stateFilePath: manifest.globalStatePath,
      themeMode: 'dark',
    },
    status: 'ready',
  })),
}));

vi.mock('@sero-ai/app-runtime', () => ({
  AppProvider: ({ value, children }: { value: { appId: string; stateFilePath: string }; children: ReactNode }) => (
    <div data-context-app={value.appId} data-context-state={value.stateFilePath}>{children}</div>
  ),
}));
vi.mock('@sero-ai/ui/plugin-style-scope', () => ({
  PluginStyleScope: ({ pluginId, children }: { pluginId: string; children: ReactNode }) => (
    <div data-style-scope={pluginId}>{children}</div>
  ),
}));
vi.mock('@/components/apps/useAppRuntimeMount', () => ({
  useAppRuntimeMount: runtimeMocks.useAppRuntimeMount,
}));
vi.mock('@/lib/federation-registry', () => ({
  getFederatedComponent: federationMocks.getFederatedComponent,
}));

import { FederatedContributionMount } from './FederatedContributionMount';

function createManifest(overrides: Partial<SeroAppManifest> = {}): SeroAppManifest {
  return {
    id: 'notes',
    name: 'Notes',
    description: null,
    version: '1.0.0',
    packageName: '@sero/notes',
    icon: 'sticky-note',
    stateFile: '.sero/apps/notes/state.json',
    scope: 'global',
    globalStatePath: '/tmp/notes.json',
    uiEntry: 'sero-ext://notes/mf-manifest.json',
    runtimeEntry: null,
    component: 'NotesApp',
    devPort: undefined,
    remoteEntryOverride: null,
    packagePath: '/tmp/notes',
    isPlugin: false,
    contributions: { components: [], controls: [] },
    contributionDiagnostics: [],
    ...overrides,
  };
}

describe('FederatedContributionMount', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    federationMocks.getFederatedComponent.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('adds stable plugin and extension identity attributes', async () => {
    federationMocks.getFederatedComponent.mockReturnValue(() => <span>Search ready</span>);

    await act(async () => {
      root.render(
        <FederatedContributionMount
          manifest={createManifest()}
          contribution={{
            id: 'search',
            extensionPoint: 'ui.global-search.panel',
            component: 'NotesSearch',
          }}
          contributionKey="notes:search"
          loading={<span>Loading</span>}
          unavailable={<span>Unavailable</span>}
        />,
      );
    });

    const surface = container.querySelector('[data-sero-contribution="search"]');
    expect(surface?.getAttribute('data-sero-plugin')).toBe('notes');
    expect(surface?.getAttribute('data-sero-extension-point')).toBe('ui.global-search.panel');
    expect(container.textContent).toContain('Search ready');
    expect(container.querySelector('[data-style-scope="notes"]')).not.toBeNull();
    expect(container.querySelector('[data-context-app="notes"]')?.getAttribute('data-context-state'))
      .toBe('/tmp/notes.json');
  });

  it('mounts a contribution whose federated UI comes only from a dev remote', async () => {
    federationMocks.getFederatedComponent.mockReturnValue(() => <span>Dev contribution</span>);

    await act(async () => {
      root.render(
        <FederatedContributionMount
          manifest={createManifest({ uiEntry: null, remoteEntryOverride: null, devPort: 4100 })}
          contribution={{
            id: 'search',
            extensionPoint: 'ui.global-search.panel',
            component: 'NotesSearch',
          }}
          contributionKey="notes:search"
          loading={null}
          unavailable={<span>Unavailable</span>}
        />,
      );
    });

    expect(container.textContent).toContain('Dev contribution');
  });

  it('isolates one failed contribution from a healthy sibling', async () => {
    function Broken() {
      throw new Error('broken contribution');
    }
    federationMocks.getFederatedComponent.mockImplementation(
      (_appId: string, component: string) => component === 'Broken' ? Broken : () => <span>Healthy</span>,
    );
    const manifest = createManifest();

    await act(async () => {
      root.render(
        <>
          <FederatedContributionMount
            manifest={manifest}
            contribution={{
              id: 'broken',
              extensionPoint: 'ui.titlebar.control',
              component: 'Broken',
            }}
            contributionKey="notes:broken"
            loading={null}
            unavailable={<span>Broken unavailable</span>}
          />
          <FederatedContributionMount
            manifest={manifest}
            contribution={{
              id: 'healthy',
              extensionPoint: 'ui.titlebar.control',
              component: 'Healthy',
            }}
            contributionKey="notes:healthy"
            loading={null}
            unavailable={<span>Healthy unavailable</span>}
          />
        </>,
      );
    });

    expect(container.textContent).toContain('Broken unavailable');
    expect(container.textContent).toContain('Healthy');
  });

  it('retries a failed contribution when discovery replaces its manifest', async () => {
    function Broken() {
      throw new Error('broken contribution');
    }
    const Healthy = () => <span>Reloaded contribution</span>;
    federationMocks.getFederatedComponent.mockImplementation(
      (_appId: string, _component: string, _devPort: number | undefined, remoteEntry: string | null) => (
        remoteEntry ? Healthy : Broken
      ),
    );
    const contribution = {
      id: 'search',
      extensionPoint: 'ui.global-search.panel' as const,
      component: 'NotesSearch',
    };

    await act(async () => {
      root.render(
        <FederatedContributionMount
          manifest={createManifest()}
          contribution={contribution}
          contributionKey="notes:search"
          loading={null}
          unavailable={<span>Unavailable</span>}
        />,
      );
    });
    expect(container.textContent).toContain('Unavailable');

    await act(async () => {
      root.render(
        <FederatedContributionMount
          manifest={createManifest({ remoteEntryOverride: 'http://localhost:5173/mf-manifest.json?t=2' })}
          contribution={contribution}
          contributionKey="notes:search"
          loading={null}
          unavailable={<span>Unavailable</span>}
        />,
      );
    });
    expect(container.textContent).toContain('Reloaded contribution');
  });
});
