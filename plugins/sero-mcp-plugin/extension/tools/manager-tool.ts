import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import type { McpRuntime } from '../runtime/mcp-runtime';
import type { ManagerAction } from './types';

const ManagerParams = Type.Object({
  action: StringEnum(['bootstrap', 'refresh', 'get_raw_config', 'save_raw_config', 'get_diagnostics'] as const),
  rawConfig: Type.Optional(Type.String({ description: 'Raw MCP config JSON for save_raw_config.' })),
});

export function registerMcpManagerTool(pi: ExtensionAPI, runtime: McpRuntime): void {
  pi.registerTool({
    name: 'mcp_manager',
    label: 'MCP Manager',
    description:
      'Internal management surface for the MCP app UI. Actions: bootstrap, refresh, get_raw_config, save_raw_config, get_diagnostics.',
    parameters: ManagerParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const managerParams = params as { action?: ManagerAction; rawConfig?: string };
      const action = managerParams.action ?? 'bootstrap';
      return runtime.executeManagerAction(action, {
        cwd: ctx?.cwd,
        rawConfig: managerParams.rawConfig,
      });
    },
  });
}
