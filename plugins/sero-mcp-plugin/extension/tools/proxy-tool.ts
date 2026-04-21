import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { StringEnum } from '@mariozechner/pi-ai';
import { Type } from '@sinclair/typebox';
import type { McpRuntime } from '../runtime/mcp-runtime';
import type { CliContext, CliResult, ProxyAction } from './types';

const ProxyParams = Type.Object({
  action: Type.Optional(StringEnum(['status', 'list', 'search', 'list_tools', 'list_resources', 'describe_tool', 'call_tool'] as const)),
  query: Type.Optional(Type.String({ description: 'Search query for MCP tools and resources.' })),
  serverName: Type.Optional(Type.String({ description: 'Server name for MCP tool inventory or calls.' })),
  toolName: Type.Optional(Type.String({ description: 'Exact MCP tool name for describe_tool or call_tool.' })),
  toolArguments: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: 'Structured MCP tool arguments for call_tool.' })),
  argumentsJson: Type.Optional(Type.String({ description: 'JSON object string for MCP tool arguments when action is call_tool.' })),
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
      'MCP proxy for Sero. Use it to inspect MCP server status, search cached MCP tools/resources, describe server tools, and call MCP tools through one bridged surface.',
    parameters: ProxyParams,
    cli: {
      summary: 'Inspect, search, and call MCP servers through one proxy surface',
      help: 'sero mcp status | list | search <query> | tools <server> | resources <server> | describe <server> <tool> | call <server> <tool> [jsonArgs] | connect <server> | reconnect <server> | enable <server> | disable <server>',
      async execute(args: string[], ctx: CliContext) {
        const action = parseCliCommand(args);
        if (action.kind === 'usage-error') {
          return { output: action.message, exitCode: 1 };
        }
        const result = action.kind === 'proxy'
          ? await runtime.executeProxyAction(action.action, {
              cwd: ctx.cwd,
              query: action.query,
              serverName: action.serverName,
              toolName: action.toolName,
              toolArguments: action.toolArguments,
              argumentsJson: action.argumentsJson,
            })
          : await runtime.executeManagerAction(action.action, { cwd: ctx.cwd, serverName: action.serverName });
        const text = result.content[0]?.text ?? '';
        return {
          output: text,
          exitCode: text.startsWith('Error:') || result.details.isError === true ? 1 : 0,
        };
      },
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const proxyParams = params as {
        action?: ProxyAction;
        query?: string;
        serverName?: string;
        toolName?: string;
        toolArguments?: Record<string, unknown>;
        argumentsJson?: string;
      };
      return runtime.executeProxyAction(proxyParams.action ?? 'status', {
        cwd: ctx?.cwd,
        query: proxyParams.query,
        serverName: proxyParams.serverName,
        toolName: proxyParams.toolName,
        toolArguments: proxyParams.toolArguments,
        argumentsJson: proxyParams.argumentsJson,
      });
    },
  };

  pi.registerTool(mcpTool);
}

type CliCommand =
  | {
      kind: 'proxy';
      action: ProxyAction;
      query?: string;
      serverName?: string;
      toolName?: string;
      toolArguments?: Record<string, unknown>;
      argumentsJson?: string;
    }
  | { kind: 'manager'; action: 'connect_server' | 'reconnect_server' | 'enable_server' | 'disable_server'; serverName: string }
  | { kind: 'usage-error'; message: string };

function parseCliCommand(args: string[]): CliCommand {
  const subcommand = args[0]?.trim();
  const serverName = args[1]?.trim();

  if (subcommand === 'list') {
    return { kind: 'proxy', action: 'list' };
  }
  if (subcommand === 'search') {
    const query = args.slice(1).join(' ').trim();
    return query
      ? { kind: 'proxy', action: 'search', query }
      : { kind: 'usage-error', message: 'Usage: sero mcp search <query>' };
  }
  if (subcommand === 'tools') {
    return serverName
      ? { kind: 'proxy', action: 'list_tools', serverName }
      : { kind: 'usage-error', message: 'Usage: sero mcp tools <server>' };
  }
  if (subcommand === 'resources') {
    return serverName
      ? { kind: 'proxy', action: 'list_resources', serverName }
      : { kind: 'usage-error', message: 'Usage: sero mcp resources <server>' };
  }
  if (subcommand === 'describe') {
    const toolName = args[2]?.trim();
    return serverName && toolName
      ? { kind: 'proxy', action: 'describe_tool', serverName, toolName }
      : { kind: 'usage-error', message: 'Usage: sero mcp describe <server> <tool>' };
  }
  if (subcommand === 'call') {
    const toolName = args[2]?.trim();
    const argumentsJson = args.slice(3).join(' ').trim();
    return serverName && toolName
      ? { kind: 'proxy', action: 'call_tool', serverName, toolName, argumentsJson: argumentsJson || undefined }
      : { kind: 'usage-error', message: 'Usage: sero mcp call <server> <tool> [jsonArgs]' };
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
