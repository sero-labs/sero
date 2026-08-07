import { ensureConfigFile } from '../config/io';
import { withAgentPluginMcpSources } from '../config/agent-plugin-source';
import type { McpConfigDocument } from '../config/types';
import { getMcpConfigPath } from '../state/paths';

export interface McpConfigPair {
  userConfig: McpConfigDocument;
  effectiveConfig: McpConfigDocument;
}

export async function readMcpConfigPair(): Promise<McpConfigPair> {
  const userConfig = await ensureConfigFile(getMcpConfigPath());
  return {
    userConfig,
    effectiveConfig: await withAgentPluginMcpSources(userConfig),
  };
}

export function withMcpServerEnabled(
  config: McpConfigDocument,
  serverName: string,
  enabled: boolean,
): McpConfigDocument {
  return {
    ...config,
    mcpServers: {
      ...config.mcpServers,
      [serverName]: { ...config.mcpServers[serverName], enabled },
    },
  };
}
