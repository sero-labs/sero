import { getToolUiResourceUri } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { CallToolResult } from '@modelcontextprotocol/client';
import type { ManagedTool } from '../manager/types';
import type { McpTaskRecord } from '../tasks/task-store';
import { MCP_APP_RESULT_LIMIT_BYTES, MCP_APP_RESULT_VIEW, type McpAppResultDetails } from '../../shared/mcp-app';
import { buildResourcesDisabledMessage } from './runtime-resource';
import type { SyncedRuntimeState } from './runtime-types';

/**
 * The details that let the chat show a tool's MCP app with its result. The
 * result is left out above the size limit, so the session file stays small.
 */
export function buildMcpAppResultDetails(input: Omit<McpAppResultDetails, 'result'> & { result: CallToolResult }): {
  seroToolResultView: typeof MCP_APP_RESULT_VIEW;
  mcpApp: McpAppResultDetails;
} {
  const { result, ...app } = input;
  const fits = Buffer.byteLength(JSON.stringify(result)) <= MCP_APP_RESULT_LIMIT_BYTES;
  return { seroToolResultView: MCP_APP_RESULT_VIEW, mcpApp: fits ? { ...app, result } : app };
}

/** The call result for a task: the task ID and the commands to follow it. The outcome comes to the chat later. */
export function formatTaskStarted(record: McpTaskRecord): string {
  return [
    `MCP tool ${record.serverName}.${record.toolName} runs as task ${record.taskId}. Sero sends the outcome to this chat when the task ends.`,
    `Check it: sero mcp task status ${record.taskId}`,
    `Wait for it: sero mcp task wait ${record.taskId}`,
    `Cancel it: sero mcp task cancel ${record.taskId}`,
  ].join('\n');
}

export function getMissingMetadataMessage(serverName: string, synced: SyncedRuntimeState): string {
  const server = synced.snapshot.servers.find((entry) => entry.serverName === serverName);
  if (server?.connectionStatus === 'needs-auth' || server?.authStatus === 'not-authenticated') {
    return buildAuthRequiredMessage(serverName);
  }
  if (server?.exposeResources === false) {
    return buildResourcesDisabledMessage(serverName);
  }
  return `No MCP metadata is cached for "${serverName}" yet. Connect or refresh this server in the MCP app first.`;
}
export function buildAuthRequiredMessage(serverName: string): string {
  return `Server "${serverName}" requires in-app authentication. Open the MCP app in Sero and authenticate there.`;
}
export function parseToolArguments(
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
export function formatCallToolResult(serverName: string, tool: ManagedTool, result: CallToolResult): string {
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
export function formatUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
