import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import type { McpServerEditorInput } from '../../shared/types';
import type { McpRuntime } from '../runtime/mcp-runtime';
import { createToolResult, isManagerAction, MCP_MANAGER_ACTIONS, type ManagerAction } from './types';

const ManagerParams = Type.Object({
  action: Type.Optional(Type.String({
    description: `Internal MCP management action. Use this tool only for server administration, auth, diagnostics, or viewer/UI flows: ${MCP_MANAGER_ACTIONS.join(', ')}. DO NOT use this tool for normal MCP status/list/search/list_tools/list_resources/describe_tool/call_tool/read_resource work; route those to the mcp tool instead, even if a similarly named internal action exists here. Legacy compatibility: action="status" is still accepted but agents should not choose it.`,
  })),
  rawConfig: Type.Optional(Type.String({ description: 'Raw MCP config JSON for save_raw_config.' })),
  serverName: Type.Optional(Type.String({ description: 'Server name for admin/auth/lifecycle actions on an MCP server.' })),
  resourceUri: Type.Optional(Type.String({ description: 'Resource URI for internal viewer actions such as open_resource or open_tool_ui. For normal agent resource reads, use mcp instead.' })),
  toolName: Type.Optional(Type.String({ description: 'Tool name for open_tool_ui (internal MCP UI flow), not for normal MCP tool execution.' })),
  toolArguments: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: 'Structured tool arguments for open_tool_ui or other internal viewer/UI flows, not for normal MCP tool calls.' })),
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
      'Internal MCP management surface. Reserve this for MCP server administration, auth, diagnostics, or viewer/UI actions. DO NOT use it for normal MCP docs lookup, discovery, resource reads, or tool execution—even if a similarly named internal action exists here. If the user says things like "use context7/github MCP to do X", use `mcp`, not `mcp_manager`. Avoid preflight thrash: do not start with `mcp_manager` status/get_raw_config/get_diagnostics unless the user is actually asking to set up or debug MCP.',
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
          `Error: Unsupported mcp_manager action "${actionCandidate}". Use \`mcp\` for normal MCP status/list/search/tools/resources/describe/call/read work, or one of these manager actions only for config/lifecycle/auth/viewer work: ${MCP_MANAGER_ACTIONS.join(', ')}.`,
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
