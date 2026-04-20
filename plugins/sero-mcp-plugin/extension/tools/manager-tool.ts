import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import type { McpServerEditorInput } from '../../shared/types';
import type { McpRuntime } from '../runtime/mcp-runtime';
import type { ManagerAction } from './types';

const ManagerParams = Type.Object({
  action: StringEnum([
    'bootstrap',
    'refresh',
    'get_raw_config',
    'save_raw_config',
    'get_diagnostics',
    'upsert_server',
    'remove_server',
    'enable_server',
    'disable_server',
  ] as const),
  rawConfig: Type.Optional(Type.String({ description: 'Raw MCP config JSON for save_raw_config.' })),
  serverName: Type.Optional(Type.String({ description: 'Server name for remove/enable/disable actions.' })),
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
    label: 'MCP Manager',
    description:
      'Internal management surface for the MCP app UI. Actions: bootstrap, refresh, raw config, diagnostics, and server CRUD/toggle operations.',
    parameters: ManagerParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const managerParams = params as Partial<McpServerEditorInput> & {
        action?: ManagerAction;
        rawConfig?: string;
        serverName?: string;
      };
      const action = managerParams.action ?? 'bootstrap';
      return runtime.executeManagerAction(action, {
        cwd: ctx?.cwd,
        rawConfig: managerParams.rawConfig,
        serverName: managerParams.serverName,
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
