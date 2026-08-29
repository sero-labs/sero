import type { EventBus } from '@earendil-works/pi-coding-agent';
import {
  AGENT_PLUGIN_CLI_REFRESH_EVENT,
  AGENT_PLUGIN_MCP_SOURCES_EVENT,
  type AgentPluginMcpSource,
  type AgentPluginMcpSourcesRequest,
} from '@sero-ai/common';
import type { McpConfigDocument, McpServerConfig } from './types';
import { readAgentPluginClientState } from './agent-plugin-client-state';

const sourceEvents = new Set<EventBus>();

function emitToActiveSessions(channel: string, data: unknown): void {
  for (const events of [...sourceEvents]) {
    try {
      events.emit(channel, data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('stale after session replacement or reload')) throw error;
      sourceEvents.delete(events);
    }
  }
}

export function configureAgentPluginMcpSource(events: EventBus | null): () => void {
  if (!events) {
    sourceEvents.clear();
    return () => {};
  }
  sourceEvents.add(events);
  return () => sourceEvents.delete(events);
}

async function requestAgentPluginMcpSources(): Promise<AgentPluginMcpSource[]> {
  if (sourceEvents.size === 0) return [];
  return new Promise((resolve) => {
    let accepted = false;
    let settled = false;
    const request = {
      accept: () => { accepted = true; },
      resolve: (sources) => {
        if (settled) return;
        settled = true;
        resolve(sources);
      },
    } satisfies AgentPluginMcpSourcesRequest;
    emitToActiveSessions(AGENT_PLUGIN_MCP_SOURCES_EVENT, request);
    queueMicrotask(() => {
      if (!accepted && !settled) {
        settled = true;
        resolve([]);
      }
    });
  });
}

export function emitAgentPluginCliRefresh(): void {
  emitToActiveSessions(AGENT_PLUGIN_CLI_REFRESH_EVENT, undefined);
}

export function hasAgentPluginMcpSourceEvents(): boolean {
  return sourceEvents.size > 0;
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
  const managedServers: Record<string, McpServerConfig> = {};
  for (const source of sources) {
    if (!source.server.valid || !source.server.approved) continue;
    managedServers[source.server.runtimeName] = toServerConfig(
      source,
      clientState.servers[source.server.runtimeName]?.enabled ?? true,
    );
  }
  return {
    ...userConfig,
    mcpServers: {
      ...userConfig.mcpServers,
      ...managedServers,
    },
  };
}
