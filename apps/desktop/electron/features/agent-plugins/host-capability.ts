import type { EventBus } from '@earendil-works/pi-coding-agent';
import { refreshAgentPluginCliCommands } from '@electron/cli';
import {
  AGENT_PLUGIN_CLI_REFRESH_EVENT,
  AGENT_PLUGIN_MCP_SOURCES_EVENT,
  type AgentPluginMcpSourcesRequest,
} from '@sero-ai/common';
import { getAgentPluginMcpSources } from './manager';

/** Give extensions a read-only view of approved host-owned MCP contributions. */
export function registerAgentPluginHostCapability(events: EventBus): void {
  events.on(AGENT_PLUGIN_CLI_REFRESH_EVENT, () => {
    refreshAgentPluginCliCommands();
  });
  events.on(AGENT_PLUGIN_MCP_SOURCES_EVENT, (data) => {
    const request = data as AgentPluginMcpSourcesRequest;
    request.accept();
    request.resolve(getAgentPluginMcpSources());
  });
}
