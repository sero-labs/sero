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
      'Initial MCP control surface for Sero. The bridged tool reports status/list today, and the CLI also supports basic connect/reconnect/enable/disable actions.',
    parameters: ProxyParams,
    cli: {
      summary: 'Inspect and control configured MCP servers',
      help: 'sero mcp status | list | connect <server> | reconnect <server> | enable <server> | disable <server>',
      async execute(args: string[], ctx: CliContext) {
        const action = parseCliCommand(args);
        if (action.kind === 'usage-error') {
          return { output: action.message, exitCode: 1 };
        }
        const result = action.kind === 'proxy'
          ? await runtime.executeProxyAction(action.action, { cwd: ctx.cwd })
          : await runtime.executeManagerAction(action.action, { cwd: ctx.cwd, serverName: action.serverName });
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

type CliCommand =
  | { kind: 'proxy'; action: ProxyAction }
  | { kind: 'manager'; action: 'connect_server' | 'reconnect_server' | 'enable_server' | 'disable_server'; serverName: string }
  | { kind: 'usage-error'; message: string };

function parseCliCommand(args: string[]): CliCommand {
  const subcommand = args[0]?.trim();
  const serverName = args[1]?.trim();

  if (subcommand === 'list') {
    return { kind: 'proxy', action: 'list' };
  }
  if (subcommand === 'connect') {
    return serverName
      ? { kind: 'manager', action: 'connect_server', serverName }
      : { kind: 'usage-error', message: 'Usage: sero mcp connect <server>' };
  }
  if (subcommand === 'reconnect') {
    return serverName
      ? { kind: 'manager', action: 'reconnect_server', serverName }
      : { kind: 'usage-error', message: 'Usage: sero mcp reconnect <server>' };
  }
  if (subcommand === 'enable') {
    return serverName
      ? { kind: 'manager', action: 'enable_server', serverName }
      : { kind: 'usage-error', message: 'Usage: sero mcp enable <server>' };
  }
  if (subcommand === 'disable') {
    return serverName
      ? { kind: 'manager', action: 'disable_server', serverName }
      : { kind: 'usage-error', message: 'Usage: sero mcp disable <server>' };
  }
  return { kind: 'proxy', action: 'status' };
}
