import { getToolUiResourceUri } from '@modelcontextprotocol/ext-apps/app-bridge';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  isMetadataCacheEntryValid,
  readMetadataCache,
  type McpMetadataCacheDocument,
} from '../cache/metadata-cache';
import type { McpConfigDocument } from '../config/types';
import { serializeResources, serializeTools } from '../manager/tool-metadata';
import { McpServerManager } from '../manager/server-manager';
import type { ManagedConnection, ManagedTool } from '../manager/types';
import type { RuntimeServerStatus } from '../state/snapshot';
import { createToolResult, type ProxyAction, type ToolResult } from '../tools/types';
import { reconcileConnection } from './runtime-connect';
import { formatServerList, formatStatusSummary } from './runtime-utils';
import type { SyncedRuntimeState } from './runtime-types';
interface ProxyToolOptions {
  cwd?: string;
  query?: string;
  serverName?: string;
  toolName?: string;
  toolArguments?: Record<string, unknown>;
  argumentsJson?: string;
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
    case 'call_tool':
      return callServerTool(options, synced);
    default:
      return createToolResult('Error: Unsupported MCP proxy action.', { mode: 'unknown_action' });
  }
}
async function searchProxyInventory(options: ProxyToolOptions, synced: SyncedRuntimeState): Promise<ToolResult> {
  const query = options.query?.trim();
  if (!query) {
    return createToolResult('Error: Search query is required.', { mode: 'search' });
  }
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
async function callServerTool(options: ProxyToolOptions, synced: SyncedRuntimeState): Promise<ToolResult> {
  const serverName = options.serverName?.trim();
  const toolName = options.toolName?.trim();
  if (!serverName) {
    return createToolResult('Error: Server name is required.', { mode: 'call_tool' });
  }
  if (!toolName) {
    return createToolResult('Error: Tool name is required.', { mode: 'call_tool', serverName });
  }
  const serverConfig = synced.config.mcpServers[serverName];
  if (!serverConfig) {
    return createToolResult(`Error: Server "${serverName}" does not exist.`, { mode: 'call_tool', serverName, toolName });
  }
  if (serverConfig.enabled === false) {
    return createToolResult(`Error: Server "${serverName}" is disabled. Enable it before calling tools.`, {
      mode: 'call_tool',
      serverName,
      toolName,
    });
  }
  const toolArguments = parseToolArguments(options.toolArguments, options.argumentsJson);
  if (toolArguments instanceof Error) {
    return createToolResult(`Error: ${toolArguments.message}`, { mode: 'call_tool', serverName, toolName });
  }
  const connection = await ensureConnectedServer(options, synced, serverName);
  if (connection.status === 'needs-auth') {
    return createToolResult(buildAuthRequiredMessage(serverName), {
      mode: 'call_tool',
      serverName,
      toolName,
      authRequired: true,
    });
  }
  if (connection.status !== 'connected') {
    return createToolResult(
      `Error: Server "${serverName}" failed to connect before calling "${toolName}".${connection.lastError ? ` ${connection.lastError}` : ''}`,
      { mode: 'call_tool', serverName, toolName },
    );
  }
  const liveTool = connection.tools.find((tool) => tool.name === toolName);
  if (!liveTool) {
    const availableTools = connection.tools.map((tool) => tool.name).sort();
    return createToolResult(
      `Error: Tool "${toolName}" was not found on "${serverName}". Available tools: ${availableTools.join(', ') || '(none)'}.`,
      { mode: 'call_tool', serverName, toolName, availableTools },
    );
  }
  try {
    const result = await options.manager.callTool(serverName, toolName, toolArguments);
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
      await options.manager.close(serverName);
      options.setRuntimeStatus(serverName, {
        connectionStatus: 'needs-auth',
        authStatus: 'not-authenticated',
        lastError: message,
        lastConnectedAt: null,
        lastFailedAt: new Date().toISOString(),
      });
      await options.syncSnapshot(options.cwd, { config: synced.config });
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
  const connection = manager.getConnection(serverName);
  if (connection?.status === 'connected') {
    return serializeResources(connection.resources);
  }
  const serverConfig = synced.config.mcpServers[serverName];
  const cachedEntry = serverConfig ? synced.metadataCache.servers[serverName] : undefined;
  if (serverConfig && cachedEntry && isMetadataCacheEntryValid(cachedEntry, serverConfig)) {
    return cachedEntry.resources;
  }
  return [];
}
function getMissingMetadataMessage(serverName: string, synced: SyncedRuntimeState): string {
  const server = synced.snapshot.servers.find((entry) => entry.serverName === serverName);
  if (server?.connectionStatus === 'needs-auth' || server?.authStatus === 'not-authenticated') {
    return buildAuthRequiredMessage(serverName);
  }
  return `No MCP metadata is cached for "${serverName}" yet. Connect or refresh this server in the MCP app first.`;
}
function buildAuthRequiredMessage(serverName: string): string {
  return `Server "${serverName}" requires in-app authentication. Open the MCP app in Sero and authenticate there.`;
}
function parseToolArguments(
  toolArguments: Record<string, unknown> | undefined,
  argumentsJson: string | undefined,
): Record<string, unknown> | undefined | Error {
  if (toolArguments) {
    return toolArguments;
  }
  const trimmed = argumentsJson?.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return new Error('Tool arguments must be a JSON object.');
    }
    return parsed as Record<string, unknown>;
  } catch {
    return new Error('Tool arguments must be valid JSON.');
  }
}
function formatCallToolResult(serverName: string, tool: ManagedTool, result: CallToolResult): string {
  const lines = extractResultContentLines(result);
  const text = lines.join('\n').trim();
  const uiResourceUri = getToolUiResourceUri({ _meta: tool._meta });
  const structured = formatStructuredContent(result.structuredContent);
  const sections = [text || (result.isError ? 'Tool execution failed.' : '(empty result)')];
  if (structured) {
    sections.push(`Structured content:\n${structured}`);
  }
  if (uiResourceUri) {
    sections.push(`This tool also advertises a UI resource: ${uiResourceUri}. Open it from the MCP app for the embedded UI experience.`);
  }
  if (result.isError && tool.inputSchema) {
    sections.push(`Expected input schema:\n${formatUnknown(tool.inputSchema)}`);
  }
  const body = sections.join('\n\n');
  return result.isError
    ? `Error: MCP tool ${serverName}.${tool.name} failed.\n\n${body}`
    : `MCP tool result from ${serverName}.${tool.name}:\n\n${body}`;
}
function extractResultContentLines(result: CallToolResult): string[] {
  const contents = Array.isArray(result.content) ? result.content : [];
  return contents.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      return '[unknown MCP content]';
    }
    const block = entry as Record<string, unknown>;
    if (block.type === 'text' && typeof block.text === 'string') {
      return block.text;
    }
    if (block.type === 'image') {
      return `[image content${typeof block.mimeType === 'string' ? `: ${block.mimeType}` : ''}]`;
    }
    if (block.type === 'audio') {
      return `[audio content${typeof block.mimeType === 'string' ? `: ${block.mimeType}` : ''}]`;
    }
    if (block.type === 'resource' || block.type === 'resource_link') {
      const resource = block.resource && typeof block.resource === 'object'
        ? block.resource as Record<string, unknown>
        : null;
      const uri = typeof resource?.uri === 'string' ? resource.uri : '(unknown resource)';
      return `[resource: ${uri}]`;
    }
    return `[${typeof block.type === 'string' ? block.type : 'unknown'} content]`;
  });
}
function formatStructuredContent(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  return formatUnknown(value);
}
function formatUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
