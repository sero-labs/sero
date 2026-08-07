import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InstalledPlugin } from '@sero-ai/common';
import type { PluginDevSessionIPC, WorkspaceRootIPC } from '../../hooks/host';
import { AttachedFoldersSection } from './AttachedFoldersSection';
import { AgentPluginInstallReview } from './AgentPluginInstallReview';
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
    packagePath: '/Users/example/.sero-ui/default/agent/plugins/weather-pro',
    hasUI: true,
    ...overrides,
  };
}

function createSession(overrides: Partial<PluginDevSessionIPC> = {}): PluginDevSessionIPC {
  return {
    sessionId: 'dev_weather',
    appId: 'weather-pro',
    name: 'Weather Pro Dev',
    sourcePath: '/Users/example/Code/sero-weather-plugin',
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
    path: '/Users/example/Code/reference-docs',
    kind: 'linked-plugin',
    ...overrides,
  };
}

describe('plugin management sections', () => {
  it('warns users to install Agent Plugins only from trusted sources', () => {
    const html = renderToStaticMarkup(
      <AgentPluginInstallReview
        inspection={{
          manifest: { $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'Example' },
          source: 'npm:example',
          sourceKind: 'npm',
          contentDigest: 'fixture-digest',
          valid: true,
          skills: [],
          mcpServers: [{
            name: 'local',
            runtimeName: 'agent-plugin:fixture:local',
            transport: 'stdio',
            valid: true,
            approved: false,
            exposedToCli: false,
            command: './bin/server',
            args: ['--safe'],
          }],
          diagnostics: [],
          requiresExecutableApproval: false,
          suggestedNamespace: 'example',
        }}
        approveExecutable={false}
        exposeToCli={false}
        namespace="example"
        busy={false}
        onApproveExecutableChange={() => {}}
        onExposeToCliChange={() => {}}
        onNamespaceChange={() => {}}
        onInstall={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(html).toContain('Install only from sources you trust.');
    expect(html).toContain('MCP servers can connect to services or run commands on this machine.');
    expect(html).toContain('local: ./bin/server --safe');
  });

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
    expect(html).toContain('Weather Pro');

    expect(html).toContain('Local Plugin Development');
    expect(html).toContain('Start local development');
    expect(html).toContain('Dev sessions do not');
    expect(html).toContain('/Users/example/Code/sero-weather-plugin');

    expect(html).toContain('Attached folders');
    expect(html).toContain('Attach folder');
    expect(html).toContain('Workspace scoped');
    expect(html).toContain('does not activate a plugin or start local development');
    expect(html).toContain('/Users/example/Code/reference-docs');
  });
});
