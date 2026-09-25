import type { SeroToolResultViewMarker } from '@sero-ai/common';

/** Names the MCP plugin's `ui.chat.tool-result` component in a tool result. */
export const MCP_APP_RESULT_VIEW: SeroToolResultViewMarker = { appId: 'mcp', contributionId: 'mcp-app' };

/** Above this size the stored details leave out the result, and the app gets only the input. */
export const MCP_APP_RESULT_LIMIT_BYTES = 256 * 1024;

/** What the chat keeps for a tool call whose tool has an MCP app. */
export interface McpAppResultDetails {
  serverName: string;
  toolName: string;
  uiResourceUri: string;
  arguments: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export function readMcpAppDetails(details: Record<string, unknown>): McpAppResultDetails | null {
  const value = details.mcpApp;
  if (!value || typeof value !== 'object') return null;
  const app = value as Record<string, unknown>;
  if (typeof app.serverName !== 'string' || typeof app.toolName !== 'string' || typeof app.uiResourceUri !== 'string') return null;
  return {
    serverName: app.serverName,
    toolName: app.toolName,
    uiResourceUri: app.uiResourceUri,
    arguments: isRecord(app.arguments) ? app.arguments : {},
    result: isRecord(app.result) ? app.result : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
