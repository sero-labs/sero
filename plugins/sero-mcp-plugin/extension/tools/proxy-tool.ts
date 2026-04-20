import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { StringEnum } from '@mariozechner/pi-ai';
import { Type } from '@sinclair/typebox';
import type { McpRuntime } from '../runtime/mcp-runtime';
import type { CliContext, CliResult, ProxyAction } from './types';

const ProxyParams = Type.Object({
  action: Type.Optional(StringEnum(['status', 'list'] as const)),
});

type ToolWithCli = Parameters<ExtensionAPI['registerTool']>[0] & {
  cli: {
    summary: string;
    help: string;
    execute: (args: string[], ctx: CliContext) => Promise<CliResult>;
  };
};

export function registerMcpProxyTool(pi: ExtensionAPI, runtime: McpRuntime): void {
  const mcpTool: ToolWithCli = {
    name: 'mcp',
    label: 'MCP',
    description:
      'Initial MCP control surface for Sero. Actions: status or list configured MCP servers while the full proxy experience is being built.',
    parameters: ProxyParams,
    cli: {
      summary: 'Inspect configured MCP servers',
      help: 'sero mcp status | list',
      async execute(args: string[], ctx: CliContext) {
        const action = parseCliAction(args);
        const result = await runtime.executeProxyAction(action, { cwd: ctx.cwd });
        const text = result.content[0]?.text ?? '';
        return {
          output: text,
          exitCode: text.startsWith('Error:') ? 1 : 0,
        };
      },
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const proxyParams = params as { action?: ProxyAction };
      return runtime.executeProxyAction(proxyParams.action ?? 'status', { cwd: ctx?.cwd });
    },
  };

  pi.registerTool(mcpTool);
}

function parseCliAction(args: string[]): ProxyAction {
  const subcommand = args[0]?.trim();
  if (subcommand === 'list') return 'list';
  return 'status';
}
