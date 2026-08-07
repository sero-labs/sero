import { existsSync, promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createJsonSchemaCliAdapter,
  type CliCommand,
  type CliRegistry,
} from '@electron/cli/core';
import { SERO_HOME } from '@electron/platform/env';
import type { AgentPluginMcpServer, AgentPluginSkill, InstalledAgentPlugin } from '@sero-ai/common';
import { readAgentPluginRegistrySync } from './registry';

interface CachedMcpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

interface McpMetadataCacheDocument {
  servers?: Record<string, { tools?: CachedMcpTool[] }>;
}

const MCP_TOOL_SEGMENT = /^[A-Za-z0-9_.-]+$/;

function readCachedTools(serverName: string): CachedMcpTool[] {
  const cachePath = path.join(SERO_HOME, 'apps', 'mcp', 'metadata-cache.json');
  if (!existsSync(cachePath)) return [];
  try {
    const cache = JSON.parse(readFileSync(cachePath, 'utf8')) as McpMetadataCacheDocument;
    const tools = cache.servers?.[serverName]?.tools;
    return Array.isArray(tools)
      ? tools.filter((tool) => typeof tool.name === 'string' && MCP_TOOL_SEGMENT.test(tool.name))
      : [];
  } catch (error) {
    console.warn('[agent-plugins] Failed to read cached MCP tools:', error);
    return [];
  }
}

function createSkillCommand(plugin: InstalledAgentPlugin, skill: AgentPluginSkill): CliCommand {
  return {
    name: `${plugin.cli.namespace}/${skill.name}`,
    summary: `Load ${skill.name} instructions from Agent Plugin ${plugin.manifest.name}`,
    help: `Loads the ${skill.name} Agent Skill from ${plugin.manifest.name}. Optional text after the command is passed to the current agent as the task. This command does not start another model invocation.`,
    params: [{ name: 'task', description: 'Optional task text for the current agent' }],
    group: `Agent Plugin: ${plugin.manifest.name}`,
    source: 'agent-plugin',
    async execute(args) {
      const instructions = await fs.readFile(skill.filePath, 'utf8');
      const task = args.join(' ').trim();
      return {
        output: task ? `${instructions}\n\nUser task for this skill:\n${task}` : instructions,
        details: { pluginId: plugin.id, component: 'skill', skillName: skill.name },
      };
    },
  };
}

function createMcpToolCommand(
  plugin: InstalledAgentPlugin,
  server: AgentPluginMcpServer,
  tool: CachedMcpTool,
  registry: CliRegistry,
): CliCommand {
  const commandName = `${plugin.cli.namespace}/${server.name}/${tool.name}`;
  const description = tool.description ?? `Call ${tool.name} on ${server.name}`;
  const adapter = createJsonSchemaCliAdapter(commandName, description, tool.inputSchema);
  return {
    name: commandName,
    summary: `${description} · Agent Plugin ${plugin.manifest.name}`,
    help: `${adapter.help}\n\nOwner: Agent Plugin ${plugin.manifest.name}, MCP server ${server.name}. The call uses the active managed MCP runtime and keeps its approval, auth, lifecycle, exclusions, scope, timeout, cancellation, and audit rules.`,
    params: adapter.params,
    group: `Agent Plugin: ${plugin.manifest.name}`,
    source: 'agent-plugin',
    async execute(args, context, onUpdate) {
      let toolArguments: Record<string, unknown>;
      try {
        toolArguments = adapter.parse(args);
      } catch (error) {
        return {
          output: `Invalid MCP tool arguments: ${error instanceof Error ? error.message : String(error)}`,
          exitCode: 1,
        };
      }
      const mcp = registry.get('mcp', {
        workspaceId: context.workspaceId,
        sessionId: context.invocation.sessionId,
      });
      if (!mcp) {
        return {
          output: `The MCP runtime is unavailable. Open ${server.name} in MCP from Agent Plugins in Admin.`,
          exitCode: 1,
        };
      }
      return mcp.execute(
        ['call', server.runtimeName, tool.name, JSON.stringify(toolArguments)],
        context,
        onUpdate,
      );
    },
  };
}

export function buildAgentPluginCliCommands(registry: CliRegistry): CliCommand[] {
  const commands: CliCommand[] = [];
  for (const plugin of readAgentPluginRegistrySync().plugins) {
    if (!plugin.enabled || !plugin.cli.enabled) continue;
    for (const skill of plugin.skills) {
      if (skill.valid && skill.exposedToCli) commands.push(createSkillCommand(plugin, skill));
    }
    for (const server of plugin.mcpServers) {
      if (!server.valid || !server.approved || !server.exposedToCli) continue;
      for (const tool of readCachedTools(server.runtimeName)) {
        commands.push(createMcpToolCommand(plugin, server, tool, registry));
      }
    }
  }
  return commands;
}
