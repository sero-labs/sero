import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/app-bridge';
import { Client, type ClientCapabilities } from '@modelcontextprotocol/client';

export const MCP_APPS_EXTENSION = 'io.modelcontextprotocol/ui';
export const MCP_TASKS_EXTENSION = 'io.modelcontextprotocol/tasks';
export const MCP_SKILLS_EXTENSION = 'io.modelcontextprotocol/skills';

/** Host features that add an extension capability. Turn one on only when its host path is ready. */
export interface McpClientFeatures {
  apps: boolean;
  tasks: boolean;
  skills: boolean;
}

export const MCP_CLIENT_FEATURES: McpClientFeatures = { apps: false, tasks: false, skills: false };

const PROBE_TIMEOUT_MS = 10_000;

export function buildClientCapabilities(features: McpClientFeatures): ClientCapabilities {
  const extensions: NonNullable<ClientCapabilities['extensions']> = {};
  if (features.apps) extensions[MCP_APPS_EXTENSION] = { mimeTypes: [RESOURCE_MIME_TYPE] };
  if (features.tasks) extensions[MCP_TASKS_EXTENSION] = {};
  if (features.skills) extensions[MCP_SKILLS_EXTENSION] = {};
  // Sero never declares the deprecated sampling or roots client features.
  return Object.keys(extensions).length > 0 ? { extensions } : {};
}

/** Builds every MCP client, so that negotiation and capabilities are set in one place. */
export function createMcpClient(
  clientName: string,
  features: McpClientFeatures = MCP_CLIENT_FEATURES,
): Client {
  return new Client({ name: clientName, version: '0.1.0' }, {
    capabilities: buildClientCapabilities(features),
    versionNegotiation: { mode: 'auto', probe: { timeoutMs: PROBE_TIMEOUT_MS } },
  });
}
