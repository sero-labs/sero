import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import type { McpServerEditorInput } from '../../shared/types';
import type { McpRuntime } from '../runtime/mcp-runtime';
import { createToolResult, isManagerAction, MCP_MANAGER_ACTIONS, type ManagerAction } from './types';

const ManagerParams = Type.Object({
  action: Type.Optional(Type.String({
    description: `Manager-only MCP action. Use this tool only for config/lifecycle/auth/viewer work: ${MCP_MANAGER_ACTIONS.join(', ')}. DO NOT use this tool for standard MCP status/list/search/tools/resources/describe/call/read; use the mcp tool instead. Legacy compatibility: action="status" is accepted but deprecated for agent work.`,
  })),
  rawConfig: Type.Optional(Type.String({ description: 'Raw MCP config JSON for save_raw_config.' })),
  serverName: Type.Optional(Type.String({ description: 'Server name for server or resource actions.' })),
  resourceUri: Type.Optional(Type.String({ description: 'Resource URI for read_resource, open_resource, or open_tool_ui.' })),
  toolName: Type.Optional(Type.String({ description: 'Tool name for open_tool_ui.' })),
  toolArguments: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: 'Structured tool arguments for open_tool_ui.' })),
  callbackUrl: Type.Optional(Type.String({ description: 'OAuth callback URL for complete_auth.' })),
  originalServerName: Type.Optional(Type.String({ description: 'Existing server name when renaming a server.' })),
  enabled: Type.Optional(Type.Boolean()),
  transport: Type.Optional(StringEnum(['stdio', 'http'] as const)),
  lifecycle: Type.Optional(StringEnum(['lazy', 'eager', 'keep-alive'] as const)),
  authMode: Type.Optional(StringEnum(['none', 'oauth', 'bearer'] as const)),
  command: Type.Optional(Type.String()),
  argsText: Type.Optional(Type.String()),
  cwd: Type.Optional(Type.String()),
  url: Type.Optional(Type.String()),
  bearerTokenEnv: Type.Optional(Type.String()),
  exposeResources: Type.Optional(Type.Boolean()),
  debug: Type.Optional(Type.Boolean()),
});

export function registerMcpManagerTool(pi: ExtensionAPI, runtime: McpRuntime): void {
  pi.registerTool({
    name: 'mcp_manager',
    label: 'MCP Internal Manager',
    description:
      'Specialized MCP management surface. DO NOT use this tool for standard MCP usage. Use `mcp` first for status, list/search, tool discovery, resource reads, and tool calls. Use `mcp_manager` only when you need to add/edit/remove servers, enable/disable/connect/reconnect servers, run auth flows, inspect raw config/diagnostics, or drive MCP UI/viewer actions. If the user says things like "using context7/github MCP ...", use `mcp`, not `mcp_manager`.',
    parameters: ManagerParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const managerParams = params as Partial<McpServerEditorInput> & {
        action?: ManagerAction;
        rawConfig?: string;
        serverName?: string;
        resourceUri?: string;
        toolName?: string;
        toolArguments?: Record<string, unknown>;
        callbackUrl?: string;
      };
      const actionText = typeof managerParams.action === 'string' ? managerParams.action.trim() : '';
      const actionCandidate = actionText || 'bootstrap';
      if (!isManagerAction(actionCandidate)) {
        return createToolResult(
          `Error: Unsupported mcp_manager action "${actionCandidate}". Use \`mcp\` for standard MCP status/list/search/tools/resources/describe/call/read, or one of these manager actions for config/lifecycle/auth/viewer work: ${MCP_MANAGER_ACTIONS.join(', ')}.`,
          { isError: true },
        );
      }
      const action: ManagerAction = actionCandidate;
      return runtime.executeManagerAction(action, {
        cwd: ctx?.cwd,
        rawConfig: managerParams.rawConfig,
        serverName: managerParams.serverName,
        resourceUri: managerParams.resourceUri,
        toolName: managerParams.toolName,
        toolArguments: managerParams.toolArguments,
        callbackUrl: managerParams.callbackUrl,
        serverInput: action === 'upsert_server' ? toServerEditorInput(managerParams) : undefined,
      });
    },
  });
}

function toServerEditorInput(value: Partial<McpServerEditorInput>): McpServerEditorInput {
  return {
    originalServerName: value.originalServerName,
    serverName: value.serverName ?? '',
    enabled: value.enabled ?? true,
    transport: value.transport ?? 'stdio',
    lifecycle: value.lifecycle ?? 'lazy',
    authMode: value.authMode ?? 'none',
    command: value.command ?? '',
    argsText: value.argsText ?? '',
    cwd: value.cwd ?? '',
    url: value.url ?? '',
    bearerTokenEnv: value.bearerTokenEnv ?? '',
    exposeResources: value.exposeResources ?? true,
    debug: value.debug ?? false,
  };
}
