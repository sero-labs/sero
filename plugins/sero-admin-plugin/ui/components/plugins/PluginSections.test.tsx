import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InstalledPlugin } from '@sero-ai/common';
import type { PluginDevSessionIPC, WorkspaceRootIPC } from '../../hooks/host';
import { AttachedFoldersSection } from './AttachedFoldersSection';
import { InstalledPluginsSection } from './InstalledPluginsSection';
import { LocalPluginDevelopmentSection } from './LocalPluginDevelopmentSection';

function createInstalledPlugin(overrides: Partial<InstalledPlugin> = {}): InstalledPlugin {
  return {
    id: 'weather-pro',
    name: 'Weather Pro',
    description: 'Forecasts and alerts for your workspace.',
    version: '1.0.0',
    icon: 'cloud-rain',
    category: 'developer-tools',
    tags: ['weather', 'alerts'],
    source: 'npm:@sero/plugin-weather-pro@latest',
    installedAt: '2026-04-19T20:00:00.000Z',
    packagePath: '/Users/daniel/.sero-ui/default/agent/packages/weather-pro',
    hasUI: true,
    ...overrides,
  };
}

function createSession(overrides: Partial<PluginDevSessionIPC> = {}): PluginDevSessionIPC {
  return {
    sessionId: 'dev_weather',
    appId: 'weather-pro',
    name: 'Weather Pro Dev',
    sourcePath: '/Users/daniel/Code/sero-weather-plugin',
    status: 'active',
    uiMode: 'dev-server',
    remoteEntryOverride: 'http://127.0.0.1:5193/mf-manifest.json',
    lastError: null,
    updatedAt: '2026-04-19T21:00:00.000Z',
    ...overrides,
  };
}

function createAttachedFolder(overrides: Partial<WorkspaceRootIPC> = {}): WorkspaceRootIPC {
  return {
    id: 'root_docs',
    name: 'Reference Docs',
    path: '/Users/daniel/Code/reference-docs',
    kind: 'linked-plugin',
    ...overrides,
  };
}

describe('plugin management sections', () => {
  it('renders installed plugins, local development, and attached folders as distinct concepts', () => {
    const html = renderToStaticMarkup(
      <>
        <InstalledPluginsSection
          plugins={[createInstalledPlugin()]}
          loading={false}
          error={null}
          installing={false}
          uninstallingIds={[]}
          onInstall={async () => true}
          onUninstall={async () => {}}
          onReveal={async () => {}}
        />
        <LocalPluginDevelopmentSection
          sessions={[createSession()]}
          loading={false}
          error={null}
          starting={false}
          refreshingIds={[]}
          stoppingIds={[]}
          onStart={async () => true}
          onRefresh={async () => {}}
          onStop={async () => {}}
          onReveal={async () => {}}
        />
        <AttachedFoldersSection
          workspaceId="workspace-1"
          folders={[createAttachedFolder()]}
          loading={false}
          busy={false}
          error={null}
          onAttach={async () => true}
          onDetach={async () => {}}
          onReveal={async () => {}}
        />
      </>,
    );

    expect(html).toContain('Installed Plugins');
    expect(html).toContain('Install plugin');
    expect(html).toContain('Managed plugin installs for this profile.');
    expect(html).toContain('Weather Pro');

    expect(html).toContain('Local Plugin Development');
    expect(html).toContain('Start local development');
    expect(html).toContain('Profile scoped');
    expect(html).toContain('Dev sessions do not');
    expect(html).toContain('/Users/daniel/Code/sero-weather-plugin');

    expect(html).toContain('Attached folders');
    expect(html).toContain('Attach folder');
    expect(html).toContain('Workspace scoped');
    expect(html).toContain('does not activate a plugin or start local development');
    expect(html).toContain('/Users/daniel/Code/reference-docs');
  });
});
