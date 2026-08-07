import type { EventBus } from '@earendil-works/pi-coding-agent';
import {
  AGENT_PLUGIN_MCP_SOURCES_EVENT,
  type AgentPluginMcpSource,
  type AgentPluginMcpSourcesRequest,
} from '@sero-ai/common';
import type { McpConfigDocument, McpServerConfig } from './types';
import { readAgentPluginClientState } from './agent-plugin-client-state';

let sourceEvents: EventBus | null = null;

export function configureAgentPluginMcpSource(events: EventBus | null): void {
  sourceEvents = events;
}

async function requestAgentPluginMcpSources(): Promise<AgentPluginMcpSource[]> {
  if (!sourceEvents) return [];
  return new Promise((resolve, reject) => {
    let accepted = false;
    sourceEvents!.emit(AGENT_PLUGIN_MCP_SOURCES_EVENT, {
      accept: () => { accepted = true; },
      resolve,
    } satisfies AgentPluginMcpSourcesRequest);
    queueMicrotask(() => {
      if (!accepted) reject(new Error('Agent Plugin host capability is unavailable.'));
    });
  });
}

function toServerConfig(source: AgentPluginMcpSource, enabled: boolean): McpServerConfig {
  const { server } = source;
  const owner = {
    pluginId: source.pluginId,
    pluginName: source.pluginName,
    serverName: server.name,
  };
  if (server.transport === 'stdio') {
    return {
      enabled,
      transport: 'stdio',
      portableTransport: 'stdio',
      command: server.command,
      args: server.args,
      env: server.env,
      cwd: server.cwd,
      lifecycle: 'lazy',
      literalEnv: true,
      managedByAgentPlugin: owner,
    };
  }
  return {
    enabled,
    transport: 'http',
    portableTransport: server.transport,
    url: server.url,
    headers: server.headers,
    lifecycle: 'lazy',
    managedByAgentPlugin: owner,
  };
}

export async function withAgentPluginMcpSources(userConfig: McpConfigDocument): Promise<McpConfigDocument> {
  const [sources, clientState] = await Promise.all([
    requestAgentPluginMcpSources(),
    readAgentPluginClientState(),
  ]);
  const managedServers = Object.fromEntries(
    sources
      .filter((source) => source.server.valid && source.server.approved)
      .map((source) => [
        source.server.runtimeName,
        toServerConfig(source, clientState.servers[source.server.runtimeName]?.enabled ?? true),
      ]),
  );
  return {
    ...userConfig,
    mcpServers: {
      ...userConfig.mcpServers,
      ...managedServers,
    },
  };
}
