import { UnauthorizedError } from '@modelcontextprotocol/client';
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/client';
import type { McpServerManager } from '../manager/server-manager';
import type { ManagedTool } from '../manager/types';
import type { UiSessionOptions } from './ui-server';

const LOST_AUTH_MESSAGE = 'This MCP UI session lost authentication. Re-authenticate the server in Sero and reopen the UI.';

/**
 * The tools that an app may see and call: tools of its own server that are
 * visible to apps and not excluded in the server config. A tool without a
 * visibility list is visible to the model and to apps.
 */
export function listAppTools(manager: McpServerManager, session: UiSessionOptions): ManagedTool[] {
  const excluded = new Set(session.excludeTools ?? []);
  return (manager.getConnection(session.serverName)?.tools ?? []).filter((tool) => {
    const ui = toRecord(tool._meta?.ui);
    return !excluded.has(tool.name) && (!Array.isArray(ui.visibility) || ui.visibility.includes('app'));
  });
}

/** Tool and resource requests that an app sends through its viewer session. */
export async function callViewerTool(manager: McpServerManager, session: UiSessionOptions, params: unknown): Promise<CallToolResult> {
  const toolCall = toRecord(params);
  const toolName = typeof toolCall.name === 'string' ? toolCall.name.trim() : '';
  const toolArguments = isRecord(toolCall.arguments) ? toolCall.arguments : undefined;
  if (!toolName) {
    return createToolErrorResult('Tool name is required.');
  }
  if (!listAppTools(manager, session).some((tool) => tool.name === toolName)) {
    return createToolErrorResult(`Blocked: ${session.serverName} has no app tool "${toolName}".`);
  }

  try {
    return await manager.callTool(session.serverName, toolName, toolArguments);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      await session.onUnauthorized?.(session.serverName, error.message || 'Authentication is required.');
      return createToolErrorResult(LOST_AUTH_MESSAGE);
    }
    return createToolErrorResult(error instanceof Error ? error.message : String(error));
  }
}

export async function readViewerResource(manager: McpServerManager, session: UiSessionOptions, params: unknown): Promise<ReadResourceResult> {
  const resourceUri = typeof toRecord(params).uri === 'string' ? String(toRecord(params).uri).trim() : '';
  if (!resourceUri) {
    throw new Error('Resource URI is required.');
  }

  try {
    return await manager.readResource(session.serverName, resourceUri);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      await session.onUnauthorized?.(session.serverName, error.message || 'Authentication is required.');
      throw new Error(LOST_AUTH_MESSAGE);
    }
    throw error;
  }
}

function createToolErrorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

export function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
