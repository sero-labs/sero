import type { McpAppState, McpServerEditorInput } from '../../shared/types';
import type { McpServerConfig } from '../config/types';
import { createToolResult, type ToolResult } from '../tools/types';

export function buildServerConfig(
  input: McpServerEditorInput,
  existing?: McpServerConfig,
): McpServerConfig {
  const next: McpServerConfig = { ...(existing ?? {}) };
  next.enabled = input.enabled;
  next.transport = input.transport;
  next.lifecycle = input.lifecycle;
  next.exposeResources = input.exposeResources;
  next.debug = input.debug;

  const cwd = input.cwd.trim();
  if (cwd) next.cwd = cwd;
  else delete next.cwd;

  if (input.transport === 'stdio') {
    next.command = input.command.trim();
    const args = parseArgsText(input.argsText);
    if (args.length > 0) next.args = args;
    else delete next.args;
    delete next.url;
  } else {
    next.url = input.url.trim();
    delete next.command;
    delete next.args;
  }

  switch (input.authMode) {
    case 'oauth':
      next.auth = 'oauth';
      delete next.bearerToken;
      delete next.bearerTokenEnv;
      break;
    case 'bearer': {
      next.auth = 'bearer';
      delete next.oauth;
      const bearerTokenEnv = input.bearerTokenEnv.trim();
      if (bearerTokenEnv) next.bearerTokenEnv = bearerTokenEnv;
      else delete next.bearerTokenEnv;
      break;
    }
    default:
      next.auth = false;
      delete next.bearerToken;
      delete next.bearerTokenEnv;
      delete next.oauth;
      break;
  }

  return next;
}

export function formatStatusSummary(snapshot: McpAppState): string {
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

export function formatServerList(snapshotServers: McpAppState['servers']): string {
  if (snapshotServers.length === 0) {
    return 'No MCP servers are configured yet. Open the MCP app in Sero to add one.';
  }

  return snapshotServers
    .map((server) => {
      const enabledLabel = server.enabled ? 'enabled' : 'disabled';
      return `- ${server.serverName} (${enabledLabel}, ${server.connectionStatus}, ${server.authStatus})`;
    })
    .join('\n');
}

export function formatDiagnostics(options: {
  configPath: string;
  statePath: string;
  rawConfigUpdatedAt: string | null;
  snapshot: McpAppState;
  sessionRefCount: number;
  hasAttachedPi: boolean;
}): string {
  const lines = [
    `Config: ${options.configPath}`,
    `State: ${options.statePath}`,
    `Raw config updated: ${options.rawConfigUpdatedAt ?? 'never'}`,
    `Servers: ${options.snapshot.summary.totalServers}`,
  ];

  for (const server of options.snapshot.servers) {
    lines.push(
      `- ${server.serverName}: ${server.transport}, ${server.lifecycle}, ${server.connectionStatus}, ${server.authStatus}, tools=${server.toolCount}, resources=${server.resourceCount}`,
    );
  }

  lines.push(`Runtime sessions: ${options.sessionRefCount}`);
  if (options.hasAttachedPi) {
    lines.push('Runtime: attached to active Pi extension instance');
  }

  return lines.join('\n');
}

export function mutationErrorResult(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return createToolResult(`Error: ${message}`, { snapshotWritten: false });
}

function parseArgsText(argsText: string): string[] {
  return argsText
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
