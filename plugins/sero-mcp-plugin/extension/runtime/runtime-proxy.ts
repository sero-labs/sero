import { getToolUiResourceUri } from '@modelcontextprotocol/ext-apps/app-bridge';
import { UnauthorizedError } from '@modelcontextprotocol/client';
import {
  isMetadataCacheEntryValid,
  readMetadataCache,
  type McpMetadataCacheDocument,
} from '../cache/metadata-cache';
import {
  isResourceExposureEnabled,
  type McpConfigDocument,
} from '../config/types';
import { serializeResources, serializeTools } from '../manager/tool-metadata';
import { McpServerManager } from '../manager/server-manager';
import type { ManagedConnection, ManagedTool } from '../manager/types';
import type { RuntimeServerStatus } from '../state/snapshot';
import { createToolResult, type ProxyAction, type ToolResult } from '../tools/types';
import { readProxyResourceAction } from './runtime-resource';
import {
  buildAuthRequiredMessage,
  escapeRegex,
  formatCallToolResult,
  formatUnknown,
  getMissingMetadataMessage,
  parseToolArguments,
} from './runtime-proxy-format';
import { reconcileConnection } from './runtime-connect';
import { formatServerList, formatStatusSummary } from './runtime-utils';
import type { SyncedRuntimeState } from './runtime-types';
interface ProxyToolOptions {
  cwd?: string;
  query?: string;
  serverName?: string;
  toolName?: string;
  resourceUri?: string;
  toolArguments?: Record<string, unknown>;
  argumentsJson?: string;
  /** Stops only this request. */
  signal?: AbortSignal;
  /** Shows a short message in the chat that made the call. */
  notify?: (text: string) => void;
  /**
   * Runs connection and state work in the runtime queue. Tool calls and
   * resource reads run outside it, so that a server question does not block other MCP work.
   */
  exclusive?: <T>(operation: () => Promise<T>) => Promise<T>;
  manager: McpServerManager;
  setRuntimeStatus: (serverName: string, status: RuntimeServerStatus) => void;
  syncSnapshot: (
    cwd?: string,
    options?: {
      config?: McpConfigDocument;
      metadataCache?: McpMetadataCacheDocument;
      rawConfigUpdatedAt?: string | null;
    },
  ) => Promise<SyncedRuntimeState>;
}
interface ToolInventoryEntry {
  name: string;
  description?: string;
  inputSchema?: unknown;
  uiResourceUri?: string;
}
interface ResourceInventoryEntry {
  uri: string;
  name: string;
  description?: string;
}
export async function executeProxyAction(options: ProxyToolOptions & { action: ProxyAction }): Promise<ToolResult> {
  // These two run their own queued setup and then call the server outside the queue.
  if (options.action === 'call_tool') return callServerTool(options);
  if (options.action === 'read_resource') return readProxyResourceAction(options);
  const synced = await options.syncSnapshot(options.cwd);
  switch (options.action) {
    case 'status':
      return createToolResult(formatStatusSummary(synced.snapshot), {
        mode: 'status',
        serverCount: synced.snapshot.summary.totalServers,
      });
    case 'list':
      return createToolResult(formatServerList(synced.snapshot.servers), {
        mode: 'list',
        serverCount: synced.snapshot.summary.totalServers,
      });
    case 'search':
      return searchProxyInventory(options, synced);
    case 'list_tools':
      return listServerTools(options, synced);
    case 'list_resources':
      return listServerResources(options, synced);
    case 'describe_tool':
      return describeServerTool(options, synced);
    default:
      return createToolResult('Error: Unsupported MCP proxy action.', { mode: 'unknown_action' });
  }
}
async function searchProxyInventory(options: ProxyToolOptions, synced: SyncedRuntimeState): Promise<ToolResult> {
  const query = options.query?.trim();
  if (!query) {
    return createToolResult('Error: Search query is required.', { mode: 'search' });
  }
  // Search stays intentionally broad: whitespace-separated query tokens are
  // treated as OR terms so short discovery prompts like "read file" or
  // "github issue" still surface likely matches from cached MCP inventory.
  const pattern = new RegExp(query.split(/\s+/).filter(Boolean).map(escapeRegex).join('|'), 'i');
  const matches: Array<Record<string, unknown>> = [];
  const servers = options.serverName?.trim() ? [options.serverName.trim()] : Object.keys(synced.config.mcpServers);
  for (const serverName of servers) {
    const toolInventory = getToolInventory(serverName, synced, options.manager);
    const resourceInventory = getResourceInventory(serverName, synced, options.manager);
    for (const tool of toolInventory) {
      if (pattern.test(tool.name) || pattern.test(tool.description ?? '')) {
        matches.push({
          kind: 'tool',
          serverName,
          name: tool.name,
          description: tool.description ?? null,
          uiResourceUri: tool.uiResourceUri ?? null,
        });
      }
    }
    for (const resource of resourceInventory) {
      if (pattern.test(resource.name) || pattern.test(resource.description ?? '') || pattern.test(resource.uri)) {
        matches.push({
          kind: 'resource',
          serverName,
          name: resource.name,
          uri: resource.uri,
          description: resource.description ?? null,
        });
      }
    }
  }
  if (matches.length === 0) {
    return createToolResult(
      `No MCP tools or resources matched "${query}". Connect or refresh servers in the MCP app if metadata has not been loaded yet.`,
      { mode: 'search', query, matches: [] },
    );
  }
  const lines = [`Found ${matches.length} MCP match(es) for "${query}":`, ''];
  for (const match of matches) {
    if (match.kind === 'tool') {
      lines.push(`- [tool] ${match.serverName as string}.${match.name as string}`);
      if (typeof match.description === 'string' && match.description) {
        lines.push(`  ${match.description}`);
      }
      if (typeof match.uiResourceUri === 'string' && match.uiResourceUri) {
        lines.push(`  UI resource: ${match.uiResourceUri}`);
      }
      continue;
    }
    lines.push(`- [resource] ${match.serverName as string} ${match.uri as string}`);
    if (typeof match.description === 'string' && match.description) {
      lines.push(`  ${match.description}`);
    }
  }
  return createToolResult(lines.join('\n'), { mode: 'search', query, matches });
}
async function listServerTools(options: ProxyToolOptions, synced: SyncedRuntimeState): Promise<ToolResult> {
  const serverName = options.serverName?.trim();
  if (!serverName) {
    return createToolResult('Error: Server name is required.', { mode: 'list_tools' });
  }
  if (!synced.config.mcpServers[serverName]) {
    return createToolResult(`Error: Server "${serverName}" does not exist.`, { mode: 'list_tools', serverName });
  }
  const tools = getToolInventory(serverName, synced, options.manager);
  if (tools.length === 0) {
    return createToolResult(getMissingMetadataMessage(serverName, synced), {
      mode: 'list_tools',
      serverName,
      tools: [],
    });
  }
  const lines = [`${serverName} tools (${tools.length}):`, ''];
  for (const tool of tools) {
    lines.push(`- ${tool.name}${tool.uiResourceUri ? ' [UI]' : ''}`);
    if (tool.description) {
      lines.push(`  ${tool.description}`);
    }
  }
  return createToolResult(lines.join('\n'), {
    mode: 'list_tools',
    serverName,
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? null,
      uiResourceUri: tool.uiResourceUri ?? null,
    })),
  });
}
async function listServerResources(options: ProxyToolOptions, synced: SyncedRuntimeState): Promise<ToolResult> {
  const serverName = options.serverName?.trim();
  if (!serverName) {
    return createToolResult('Error: Server name is required.', { mode: 'list_resources' });
  }
  if (!synced.config.mcpServers[serverName]) {
    return createToolResult(`Error: Server "${serverName}" does not exist.`, { mode: 'list_resources', serverName });
  }
  const resources = getResourceInventory(serverName, synced, options.manager);
  if (resources.length === 0) {
    return createToolResult(getMissingMetadataMessage(serverName, synced), {
      mode: 'list_resources',
      serverName,
      resources: [],
    });
  }
  const lines = [`${serverName} resources (${resources.length}):`, ''];
  for (const resource of resources) {
    lines.push(`- ${resource.name}`);
    lines.push(`  ${resource.uri}`);
    if (resource.description) {
      lines.push(`  ${resource.description}`);
    }
  }
  return createToolResult(lines.join('\n'), {
    mode: 'list_resources',
    serverName,
    resources: resources.map((resource) => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description ?? null,
    })),
  });
}
async function describeServerTool(options: ProxyToolOptions, synced: SyncedRuntimeState): Promise<ToolResult> {
  const serverName = options.serverName?.trim();
  const toolName = options.toolName?.trim();
  if (!serverName) {
    return createToolResult('Error: Server name is required.', { mode: 'describe_tool' });
  }
  if (!toolName) {
    return createToolResult('Error: Tool name is required.', { mode: 'describe_tool', serverName });
  }
  if (!synced.config.mcpServers[serverName]) {
    return createToolResult(`Error: Server "${serverName}" does not exist.`, { mode: 'describe_tool', serverName });
  }
  const tool = getToolInventory(serverName, synced, options.manager).find((entry) => entry.name === toolName);
  if (!tool) {
    return createToolResult(
      `Error: Tool "${toolName}" was not found on "${serverName}". Use action="list_tools" to inspect the available tool names.`,
      { mode: 'describe_tool', serverName, toolName },
    );
  }
  const lines = [`Tool: ${serverName}.${tool.name}`];
  if (tool.description) {
    lines.push('', tool.description);
  }
  if (tool.uiResourceUri) {
    lines.push('', `UI resource: ${tool.uiResourceUri}`);
  }
  lines.push('', 'Input schema:', formatUnknown(tool.inputSchema ?? '(no schema reported)'));
  return createToolResult(lines.join('\n'), {
    mode: 'describe_tool',
    serverName,
    toolName,
    inputSchema: tool.inputSchema ?? null,
    uiResourceUri: tool.uiResourceUri ?? null,
  });
}
type PreparedToolCall =
  | { result: ToolResult }
  | { serverName: string; toolName: string; toolArguments?: Record<string, unknown>; liveTool: ManagedTool; synced: SyncedRuntimeState };

async function callServerTool(options: ProxyToolOptions): Promise<ToolResult> {
  const exclusive = options.exclusive ?? ((operation) => operation());
  const prepared = await exclusive(() => prepareToolCall(options));
  if ('result' in prepared) return prepared.result;
  const { serverName, toolName, toolArguments, liveTool, synced } = prepared;
  try {
    const result = await options.manager.callTool(serverName, toolName, toolArguments, { signal: options.signal, notify: options.notify });
    const text = formatCallToolResult(serverName, liveTool, result);
    return createToolResult(text, {
      mode: 'call_tool',
      serverName,
      toolName,
      isError: Boolean(result.isError),
      structuredContent: result.structuredContent ?? null,
      uiResourceUri: getToolUiResourceUri({ _meta: liveTool._meta }) ?? null,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      const message = error.message || 'Authentication is required.';
      await exclusive(async () => {
        await options.manager.close(serverName);
        options.setRuntimeStatus(serverName, {
          connectionStatus: 'needs-auth',
          authStatus: 'not-authenticated',
          lastError: message,
          lastConnectedAt: null,
          lastFailedAt: new Date().toISOString(),
        });
        await options.syncSnapshot(options.cwd, { config: synced.config });
      });
      return createToolResult(buildAuthRequiredMessage(serverName), {
        mode: 'call_tool',
        serverName,
        toolName,
        authRequired: true,
        snapshotWritten: true,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    return createToolResult(`Error: Failed to call MCP tool "${toolName}" on "${serverName}". ${message}`, {
      mode: 'call_tool',
      serverName,
      toolName,
    });
  }
}

async function prepareToolCall(options: ProxyToolOptions): Promise<PreparedToolCall> {
  const synced = await options.syncSnapshot(options.cwd);
  const serverName = options.serverName?.trim();
  const toolName = options.toolName?.trim();
  if (!serverName) {
    return { result: createToolResult('Error: Server name is required.', { mode: 'call_tool' }) };
  }
  if (!toolName) {
    return { result: createToolResult('Error: Tool name is required.', { mode: 'call_tool', serverName }) };
  }
  const serverConfig = synced.config.mcpServers[serverName];
  if (!serverConfig) {
    return { result: createToolResult(`Error: Server "${serverName}" does not exist.`, { mode: 'call_tool', serverName, toolName }) };
  }
  if (serverConfig.enabled === false) {
    return { result: createToolResult(`Error: Server "${serverName}" is disabled. Enable it before calling tools.`, {
      mode: 'call_tool',
      serverName,
      toolName,
    }) };
  }
  const toolArguments = parseToolArguments(options.toolArguments, options.argumentsJson);
  if (toolArguments instanceof Error) {
    return { result: createToolResult(`Error: ${toolArguments.message}`, { mode: 'call_tool', serverName, toolName }) };
  }
  const connection = await ensureConnectedServer(options, synced, serverName);
  if (connection.status === 'needs-auth') {
    return { result: createToolResult(buildAuthRequiredMessage(serverName), {
      mode: 'call_tool',
      serverName,
      toolName,
      authRequired: true,
    }) };
  }
  if (connection.status !== 'connected') {
    return { result: createToolResult(
      `Error: Server "${serverName}" failed to connect before calling "${toolName}".${connection.lastError ? ` ${connection.lastError}` : ''}`,
      { mode: 'call_tool', serverName, toolName },
    ) };
  }
  const liveTool = connection.tools.find((tool) => tool.name === toolName);
  if (!liveTool) {
    const availableTools = connection.tools.map((tool) => tool.name).sort();
    return { result: createToolResult(
      `Error: Tool "${toolName}" was not found on "${serverName}". Available tools: ${availableTools.join(', ') || '(none)'}.`,
      { mode: 'call_tool', serverName, toolName, availableTools },
    ) };
  }
  return { serverName, toolName, toolArguments, liveTool, synced };
}

async function ensureConnectedServer(
  options: ProxyToolOptions,
  synced: SyncedRuntimeState,
  serverName: string,
): Promise<ManagedConnection> {
  const existing = options.manager.getConnection(serverName);
  if (existing?.status === 'connected' || existing?.status === 'needs-auth') {
    return existing;
  }
  const serverConfig = synced.config.mcpServers[serverName];
  const connection = existing
    ? await options.manager.reconnect(serverName, serverConfig)
    : await options.manager.connect(serverName, serverConfig);
  const metadataCache = await readMetadataCache();
  const { nextCache, runtimeStatus } = await reconcileConnection({
    serverName,
    serverConfig,
    metadataCache,
    connection,
  });
  options.setRuntimeStatus(serverName, runtimeStatus);
  await options.syncSnapshot(options.cwd, { config: synced.config, metadataCache: nextCache });
  return connection;
}
function getToolInventory(serverName: string, synced: SyncedRuntimeState, manager: McpServerManager): ToolInventoryEntry[] {
  const connection = manager.getConnection(serverName);
  if (connection?.status === 'connected') {
    return serializeTools(connection.tools);
  }
  const serverConfig = synced.config.mcpServers[serverName];
  const cachedEntry = serverConfig ? synced.metadataCache.servers[serverName] : undefined;
  if (serverConfig && cachedEntry && isMetadataCacheEntryValid(cachedEntry, serverConfig)) {
    return cachedEntry.tools;
  }
  return [];
}
function getResourceInventory(serverName: string, synced: SyncedRuntimeState, manager: McpServerManager): ResourceInventoryEntry[] {
  const serverConfig = synced.config.mcpServers[serverName];
  if (!serverConfig || !isResourceExposureEnabled(serverConfig)) {
    return [];
  }

  const connection = manager.getConnection(serverName);
  if (connection?.status === 'connected') {
    return serializeResources(connection.resources);
  }

  const cachedEntry = synced.metadataCache.servers[serverName];
  if (cachedEntry && isMetadataCacheEntryValid(cachedEntry, serverConfig)) {
    return cachedEntry.resources;
  }
  return [];
}
