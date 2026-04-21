import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { StringEnum } from '@mariozechner/pi-ai';
import { Type } from '@sinclair/typebox';
import type { McpRuntime } from '../runtime/mcp-runtime';
import type { CliContext, CliResult, ProxyAction } from './types';

const MCP_TOOL_ACTIONS = [
  'status',
  'list',
  'search',
  'list_tools',
  'list_resources',
  'describe_tool',
  'call_tool',
  'read_resource',
  'connect',
  'reconnect',
] as const;

type McpToolAction = ProxyAction | 'connect' | 'reconnect';

const ProxyParams = Type.Object({
  action: Type.Optional(StringEnum(MCP_TOOL_ACTIONS)),
  query: Type.Optional(Type.String({ description: 'Search query for MCP tools and resources.' })),
  serverName: Type.Optional(Type.String({ description: 'Server name for MCP inventory, resource/tool calls, or connect/reconnect actions.' })),
  toolName: Type.Optional(Type.String({ description: 'Exact MCP tool name for describe_tool or call_tool.' })),
  resourceUri: Type.Optional(Type.String({ description: 'Resource URI for read_resource.' })),
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
      'Preferred MCP surface for agents in Sero. Start here for status, list/search, tool discovery, resource reads, and tool calls. Live reads and tool calls auto-connect enabled servers when needed. If the user says things like "using context7/github MCP ...", use this tool directly. Reach for `mcp_manager` only when the user explicitly wants to add/edit/remove/enable/disable/connect/reconnect/authenticate an MCP server or use MCP UI/viewer management actions.',
    parameters: ProxyParams,
    cli: {
      summary: 'Preferred MCP surface for status, discovery, and live MCP reads/calls',
      help: 'Use this tool first for MCP status/list/search/tools/resources/describe/call/read. If the user asks to use a server like context7/github directly, start here rather than mcp_manager. Live read/call actions auto-connect enabled servers when needed. Use mcp_manager only for MCP config/lifecycle/auth/viewer actions. CLI: sero mcp status | list | search <query> | tools <server> | resources <server> | read <server> <resourceUri> | describe <server> <tool> | call <server> <tool> [jsonArgs] | connect <server> | reconnect <server> | enable <server> | disable <server>',
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
              resourceUri: action.resourceUri,
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
        action?: McpToolAction;
        query?: string;
        serverName?: string;
        toolName?: string;
        resourceUri?: string;
        toolArguments?: Record<string, unknown>;
        argumentsJson?: string;
      };
      const action = proxyParams.action ?? 'status';
      if (action === 'connect' || action === 'reconnect') {
        return runtime.executeManagerAction(action === 'connect' ? 'connect_server' : 'reconnect_server', {
          cwd: ctx?.cwd,
          serverName: proxyParams.serverName,
        });
      }
      return runtime.executeProxyAction(action, {
        cwd: ctx?.cwd,
        query: proxyParams.query,
        serverName: proxyParams.serverName,
        toolName: proxyParams.toolName,
        resourceUri: proxyParams.resourceUri,
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
      resourceUri?: string;
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
  if (subcommand === 'read') {
    const resourceUri = args.slice(2).join(' ').trim();
    return serverName && resourceUri
      ? { kind: 'proxy', action: 'read_resource', serverName, resourceUri }
      : { kind: 'usage-error', message: 'Usage: sero mcp read <server> <resourceUri>' };
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
