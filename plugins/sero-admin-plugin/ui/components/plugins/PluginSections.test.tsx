import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InstalledAgentPlugin, InstalledPlugin } from '@sero-ai/common';
import type { PluginDevSessionIPC, WorkspaceRootIPC } from '../../hooks/host';
import type { AgentPluginsController } from '../../hooks/useAgentPlugins';
import { AttachedFoldersSection } from './AttachedFoldersSection';
import { AgentPluginCard } from './AgentPluginCard';
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

const SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

function createAgentPlugin(overrides: Partial<InstalledAgentPlugin> = {}): InstalledAgentPlugin {
  return {
    id: 'ap-example',
    manifest: { $schema: SCHEMA, name: 'Example' },
    source: 'npm:example',
    sourceKind: 'npm',
    contentDigest: 'installed-digest',
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
    ...overrides,
  };
}

function createAgentPluginController(overrides: Partial<AgentPluginsController> = {}): AgentPluginsController {
  return {
    plugins: [], inspection: null, updatePreview: null, loading: false, busy: false, error: null,
    clearInspection: () => {},
    clearUpdatePreview: () => {},
    inspect: async () => null,
    install: async () => null,
    setEnabled: async () => null,
    approve: async () => null,
    setCliExposure: async () => null,
    previewUpdate: async () => null,
    update: async () => null,
    remove: async () => null,
    reveal: async () => {},
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
            cwd: '/plugin/data',
            env: { PATH: '/plugin/bin', API_TOKEN: 'secret' },
          }, {
            name: 'remote',
            runtimeName: 'agent-plugin:fixture:remote',
            transport: 'streamable-http',
            valid: true,
            approved: false,
            exposedToCli: false,
            url: 'https://example.com/mcp',
            headers: { Authorization: 'Bearer secret', 'X-Tenant': 'example' },
          }],
          diagnostics: [],
          requiresMcpApproval: false,
          suggestedNamespace: 'example',
        }}
        approveMcp={false}
        exposeToCli={false}
        busy={false}
        onApproveMcpChange={() => {}}
        onExposeToCliChange={() => {}}
        onInstall={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(html).toContain('Install only from sources you trust.');
    expect(html).toContain('MCP servers can connect to services or run commands on this machine.');
    expect(html).toContain('stdio · ./bin/server --safe (cwd: /plugin/data; env: API_TOKEN, PATH)');
    expect(html).toContain('https://example.com/mcp (headers: Authorization, X-Tenant)');
    expect(html).not.toContain('Bearer secret');
    expect(html).toContain('Show in Sero CLI');
  });

  it('shows safe MCP details before initial and update approval', () => {
    const plugin: InstalledAgentPlugin = {
      id: 'ap-example',
      manifest: { $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'Example' },
      source: 'npm:example',
      sourceKind: 'npm',
      contentDigest: 'installed-digest',
      installedAt: '2026-08-07T12:00:00.000Z',
      updatedAt: '2026-08-07T12:00:00.000Z',
      packagePath: '/plugins/ap-example',
      dataPath: '/data/ap-example',
      enabled: true,
      mcpApprovalHash: null,
      skills: [],
      mcpServers: [{
        name: 'local', runtimeName: 'agent-plugin:ap-example:local', transport: 'stdio',
        valid: true, approved: false, exposedToCli: false,
        command: './bin/server', cwd: '/plugin/data', env: { PATH: '/plugin/bin' },
      }],
      diagnostics: [],
      cli: { enabled: false, namespace: 'example', skillCommands: [], mcpCommands: [] },
    };
    const controller = {
      plugins: [plugin], inspection: null, loading: false, busy: false, error: null,
      updatePreview: {
        pluginId: plugin.id,
        contentDigest: 'updated-digest',
        addedComponents: [], removedComponents: [], changedComponents: ['mcp:remote'],
        addedCliCommands: [], removedCliCommands: [], requiresMcpApproval: true,
        mcpServers: [{
          name: 'remote', runtimeName: 'agent-plugin:ap-example:remote', transport: 'streamable-http',
          valid: true, approved: false, exposedToCli: false,
          url: 'https://example.com/mcp', headers: { Authorization: 'Bearer secret' },
        }],
      },
      clearInspection: () => {},
      clearUpdatePreview: () => {},
      inspect: async () => null,
      install: async () => null,
      setEnabled: async () => null,
      approve: async () => null,
      setCliExposure: async () => null,
      previewUpdate: async () => null,
      update: async () => null,
      remove: async () => null,
      reveal: async () => {},
    } satisfies AgentPluginsController;

    const html = renderToStaticMarkup(<AgentPluginCard plugin={plugin} controller={controller} focused />);
    expect(html).toContain('Show in Sero CLI');
    expect(html).toContain('Plugin source');
    expect(html).toContain('Check for update');
    expect(html).toContain('Approve shown MCP definitions');
    expect(html).not.toContain('Plugin contents');
    expect(html).not.toContain('Sero settings');
    expect(html).toContain('stdio · ./bin/server (cwd: /plugin/data; env: PATH)');
    expect(html).toContain('remote: https://example.com/mcp (headers: Authorization)');
    expect(html).not.toContain('Bearer secret');
  });

  it('keeps an update installable when no component changed', () => {
    const plugin = createAgentPlugin();
    const html = renderToStaticMarkup(
      <AgentPluginCard
        plugin={plugin}
        focused
        controller={createAgentPluginController({
          plugins: [plugin],
          updatePreview: {
            pluginId: plugin.id, contentDigest: 'updated-digest',
            previousVersion: '1.0.0', nextVersion: '1.1.0',
            addedComponents: [], removedComponents: [], changedComponents: [],
            addedCliCommands: [], removedCliCommands: [], requiresMcpApproval: false, mcpServers: [],
          },
        })}
      />,
    );

    expect(html).toContain('1.0.0 → 1.1.0');
    expect(html).toContain('No skill, MCP or Sero CLI changes.');
    expect(html).toContain('Install update');
  });

  it('reports diagnostics no component row carries, and never crosses a skill with an MCP server of the same name', () => {
    const plugin = createAgentPlugin({
      skills: [{ name: 'shared', description: 'A skill', directoryName: 'shared', filePath: '/x/SKILL.md', valid: false, exposedToCli: false }],
      mcpServers: [{ name: 'shared', runtimeName: 'agent-plugin:ap-example:shared', transport: 'stdio', valid: false, approved: false, exposedToCli: false }],
      diagnostics: [
        { level: 'error', component: 'skill', componentName: 'shared', message: 'SKILL.md description is missing' },
        { level: 'error', component: 'mcp', componentName: 'shared', message: 'unsupported schema version 2.0.0' },
        { level: 'error', component: 'skill', componentName: 'shared', message: 'SKILL.md exceeds the size limit' },
        { level: 'error', component: 'manifest', message: 'plugin.json declares an unknown extension' },
        { level: 'warning', component: 'skill', componentName: 'shared', message: 'the skill name is long' },
      ],
    });
    const html = renderToStaticMarkup(
      <AgentPluginCard plugin={plugin} focused controller={createAgentPluginController({ plugins: [plugin] })} />,
    );

    expect(html).toContain('Skipped · SKILL.md description is missing');
    expect(html).toContain('Skipped · unsupported schema version 2.0.0');
    expect(html).toContain('plugin.json declares an unknown extension');
    expect(html).toContain('the skill name is long');
    // A second error for the same component keeps its own line instead of vanishing.
    expect(html).toContain('SKILL.md exceeds the size limit');
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
