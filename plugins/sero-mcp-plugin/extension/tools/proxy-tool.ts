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
  action: Type.Optional(StringEnum(MCP_TOOL_ACTIONS, {
    description: 'Preferred MCP action. Use this tool first for normal MCP status/discovery/read/call work. If the user already named a server and task, use this tool directly instead of starting with mcp_manager. When the exact tool or arguments are unclear, use list_tools or describe_tool first. Use connect/reconnect only for explicit lifecycle requests; live MCP reads and tool calls auto-connect enabled servers when needed.',
  })),
  query: Type.Optional(Type.String({ description: 'Search query for MCP tools and resources.' })),
  serverName: Type.Optional(Type.String({ description: 'Server name for list_tools, list_resources, read_resource, describe_tool, call_tool, or explicit connect/reconnect requests.' })),
  toolName: Type.Optional(Type.String({ description: 'Exact MCP tool name for describe_tool or call_tool. If unsure, use list_tools first.' })),
  resourceUri: Type.Optional(Type.String({ description: 'Exact MCP resource URI for read_resource, usually taken from list_resources or known server docs/resource paths.' })),
  toolArguments: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: 'Preferred way to pass call_tool arguments: a structured object matching the MCP tool schema.' })),
  argumentsJson: Type.Optional(Type.String({ description: 'Fallback for call_tool only: a valid JSON object string when structured toolArguments cannot be supplied. Example: {"query":"oauth"}.' })),
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
      'Preferred MCP surface for agents in Sero. Start here for normal MCP status, list/search, tool discovery, resource reads, and tool calls. If the user says things like "use context7/github MCP to do X", use this tool directly instead of starting with `mcp_manager` status/config/diagnostics calls. When the exact tool name or arguments are unclear, use `list_tools` or `describe_tool` first, then `call_tool`. Prefer structured `toolArguments`; use `argumentsJson` only as a fallback. Live reads and tool calls auto-connect enabled servers when needed. Reach for `mcp_manager` only when the user explicitly wants server setup/admin/auth/viewer work.',
    parameters: ProxyParams,
    cli: {
      summary: 'Preferred MCP surface for status, discovery, and live MCP reads/calls',
      help: 'Use this tool first for MCP status/list/search/tools/resources/describe/call/read. If the user asks to use a server like context7/github directly, start here rather than mcp_manager. When the tool name or arguments are unclear, use tools/describe first; once known, call the tool directly. Live read/call actions auto-connect enabled servers when needed. Use mcp_manager only for MCP config/lifecycle/auth/viewer actions. CLI: sero mcp status | list | search <query> | tools <server> | resources <server> | read <server> <resourceUri> | describe <server> <tool> | call <server> <tool> [jsonArgs] | connect <server> | reconnect <server> | enable <server> | disable <server>. Action-style aliases are also accepted: list_tools, list_resources, describe_tool, call_tool, read_resource, connect_server, reconnect_server, enable_server, disable_server.',
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
  const subcommand = normalizeCliSubcommand(args[0]);
  const serverName = args[1]?.trim();

  if (!subcommand || subcommand === 'status') {
    return { kind: 'proxy', action: 'status' };
  }
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

  return {
    kind: 'usage-error',
    message: `Unknown MCP subcommand: ${args[0]}. Use \`sero help mcp\` for usage.`,
  };
}

function normalizeCliSubcommand(value: string | undefined): string {
  const trimmed = value?.trim().toLowerCase();
  switch (trimmed) {
    case undefined:
    case '':
      return '';
    case 'status':
      return 'status';
    case 'list':
      return 'list';
    case 'search':
      return 'search';
    case 'tools':
    case 'list_tools':
    case 'list-tools':
      return 'tools';
    case 'resources':
    case 'list_resources':
    case 'list-resources':
      return 'resources';
    case 'read':
    case 'read_resource':
    case 'read-resource':
      return 'read';
    case 'describe':
    case 'describe_tool':
    case 'describe-tool':
      return 'describe';
    case 'call':
    case 'call_tool':
    case 'call-tool':
      return 'call';
    case 'connect':
    case 'connect_server':
    case 'connect-server':
      return 'connect';
    case 'reconnect':
    case 'reconnect_server':
    case 'reconnect-server':
      return 'reconnect';
    case 'enable':
    case 'enable_server':
    case 'enable-server':
      return 'enable';
    case 'disable':
    case 'disable_server':
    case 'disable-server':
      return 'disable';
    default:
      return trimmed;
  }
}
