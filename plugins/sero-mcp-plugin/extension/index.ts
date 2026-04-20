import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { ensureOAuthDir } from './auth/storage';
import { readMetadataCache, writeMetadataCache } from './cache/metadata-cache';
import { ensureConfigFile, getConfigUpdatedAt, normalizeConfigDocument, readRawConfig, writeConfig } from './config/io';
import { createSnapshotFromConfig, writeState } from './state/state-io';
import { getMcpConfigPath, getMcpStatePath } from './state/paths';

const ManagerParams = Type.Object({
  action: StringEnum(['bootstrap', 'refresh', 'get_raw_config', 'save_raw_config'] as const),
  rawConfig: Type.Optional(Type.String({ description: 'Raw MCP config JSON for save_raw_config.' })),
});

const ProxyParams = Type.Object({
  action: Type.Optional(StringEnum(['status', 'list'] as const)),
});

type ManagerAction = 'bootstrap' | 'refresh' | 'get_raw_config' | 'save_raw_config';
type ProxyAction = 'status' | 'list';
type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  details: Record<string, unknown>;
};
type CliResult = {
  output: string;
  exitCode: number;
};
type CliContext = {
  cwd: string;
};
type ToolWithCli = Parameters<ExtensionAPI['registerTool']>[0] & {
  cli: {
    summary: string;
    help: string;
    execute: (args: string[], ctx: CliContext) => Promise<CliResult>;
  };
};

export default function mcpExtension(pi: ExtensionAPI) {
  pi.on('session_start', async (_event, ctx) => {
    await syncSnapshot(ctx.cwd).catch((error) => {
      console.error('[mcp] Failed to bootstrap snapshot on session start', error);
    });
  });

  pi.on('session_switch', async (_event, ctx) => {
    await syncSnapshot(ctx.cwd).catch((error) => {
      console.error('[mcp] Failed to refresh snapshot on session switch', error);
    });
  });

  pi.registerTool({
    name: 'mcp_manager',
    label: 'MCP Manager',
    description:
      'Internal management surface for the MCP app UI. Actions: bootstrap, refresh, get_raw_config, save_raw_config.',
    parameters: ManagerParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const managerParams = params as { action?: ManagerAction; rawConfig?: string };
      const action = managerParams.action ?? 'bootstrap';
      return runManagerAction(action, ctx?.cwd, managerParams.rawConfig);
    },
  });

  const mcpTool: ToolWithCli = {
    name: 'mcp',
    label: 'MCP',
    description:
      'Initial MCP control surface for Sero. Actions: status or list configured MCP servers while the full proxy experience is being built.',
    parameters: ProxyParams,
    cli: {
      summary: 'Inspect configured MCP servers',
      help: 'sero mcp status | list',
      async execute(args: string[], ctx: CliContext) {
        const action = parseCliAction(args);
        const result = await runProxyAction(action, ctx.cwd);
        return {
          output: result.content[0]?.text ?? '',
          exitCode: result.content[0]?.text?.startsWith('Error:') ? 1 : 0,
        };
      },
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const proxyParams = params as { action?: ProxyAction };
      return runProxyAction(proxyParams.action ?? 'status', ctx?.cwd);
    },
  };

  pi.registerTool(mcpTool);
}

function parseCliAction(args: string[]): ProxyAction {
  const subcommand = args[0]?.trim();
  if (subcommand === 'list') return 'list';
  return 'status';
}

async function runManagerAction(action: ManagerAction, cwd?: string, rawConfigInput?: string): Promise<ToolResult> {
  if (action === 'save_raw_config') {
    return saveRawConfig(cwd, rawConfigInput);
  }

  const synced = await syncSnapshot(cwd);

  if (action === 'get_raw_config') {
    const rawConfig = await readRawConfig(synced.configPath);
    return toToolResult(rawConfig.trim() || '{}', {
      snapshotWritten: true,
      configPath: synced.configPath,
      statePath: synced.statePath,
      rawConfig,
    });
  }

  const prefix = action === 'refresh' ? 'Refreshed' : 'Initialized';
  return toToolResult(`${prefix} MCP app state for ${synced.snapshot.summary.totalServers} configured server(s).`, {
    snapshotWritten: true,
    configPath: synced.configPath,
    statePath: synced.statePath,
    serverCount: synced.snapshot.summary.totalServers,
  });
}

async function runProxyAction(action: ProxyAction, cwd?: string): Promise<ToolResult> {
  const synced = await syncSnapshot(cwd);
  if (action === 'list') {
    return toToolResult(formatServerList(synced.snapshot.servers), {
      mode: 'list',
      serverCount: synced.snapshot.summary.totalServers,
    });
  }

  return toToolResult(formatStatusSummary(synced.snapshot), {
    mode: 'status',
    serverCount: synced.snapshot.summary.totalServers,
  });
}

async function syncSnapshot(cwd?: string) {
  const configPath = getMcpConfigPath();
  const statePath = getMcpStatePath(cwd);
  const config = await ensureConfigFile(configPath);
  const rawConfigUpdatedAt = await getConfigUpdatedAt(configPath);
  const metadataCache = await readMetadataCache();
  await Promise.all([
    ensureOAuthDir(),
    writeMetadataCache(metadataCache),
  ]);
  const snapshot = createSnapshotFromConfig(configPath, config, rawConfigUpdatedAt);
  await writeState(snapshot, statePath);
  return { configPath, statePath, snapshot };
}

async function saveRawConfig(cwd: string | undefined, rawConfigInput?: string): Promise<ToolResult> {
  if (!rawConfigInput?.trim()) {
    return toToolResult('Error: Raw config cannot be empty.', { snapshotWritten: false });
  }

  try {
    const parsed = JSON.parse(rawConfigInput);
    const normalized = normalizeConfigDocument(parsed);
    const configPath = getMcpConfigPath();
    await writeConfig(normalized, configPath);
    const synced = await syncSnapshot(cwd);
    return toToolResult(`Saved MCP config with ${synced.snapshot.summary.totalServers} configured server(s).`, {
      snapshotWritten: true,
      configPath: synced.configPath,
      statePath: synced.statePath,
      rawConfig: `${JSON.stringify(normalized, null, 2)}\n`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toToolResult(`Error: Failed to save raw MCP config. ${message}`, {
      snapshotWritten: false,
    });
  }
}

function formatStatusSummary(snapshot: Awaited<ReturnType<typeof syncSnapshot>>['snapshot']): string {
  const lines = [
    `MCP status: ${snapshot.summary.totalServers} server(s) configured`,
    `Enabled: ${snapshot.summary.enabledServers}`,
    `Connected: ${snapshot.summary.connectedServers}`,
    `Needs auth: ${snapshot.summary.needsAuthServers}`,
    `Errors: ${snapshot.summary.errorServers}`,
  ];

  if (snapshot.servers.length === 0) {
    lines.push('', 'Open the MCP app in Sero to add your first MCP server.');
  }

  return lines.join('\n');
}

function formatServerList(servers: Array<{ serverName: string; enabled: boolean; connectionStatus: string; authStatus: string }>): string {
  if (servers.length === 0) {
    return 'No MCP servers are configured yet. Open the MCP app in Sero to add one.';
  }

  return servers
    .map((server) => {
      const enabledLabel = server.enabled ? 'enabled' : 'disabled';
      return `- ${server.serverName} (${enabledLabel}, ${server.connectionStatus}, ${server.authStatus})`;
    })
    .join('\n');
}

function toToolResult(text: string, details: Record<string, unknown> = {}): ToolResult {
  return {
    content: [{ type: 'text', text }],
    details,
  };
}
