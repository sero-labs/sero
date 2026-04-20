import { getToolUiResourceUri } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { CachedMcpResource, CachedMcpTool, McpMetadataCacheEntry } from '../cache/metadata-cache';
import type { ManagedResource, ManagedTool } from './types';

export function serializeTools(tools: ManagedTool[]): CachedMcpTool[] {
  return tools
    .filter((tool) => !!tool?.name)
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      uiResourceUri: extractToolUiResourceUri(tool),
    }));
}

export function serializeResources(resources: ManagedResource[]): CachedMcpResource[] {
  return resources
    .filter((resource) => !!resource?.uri && !!resource?.name)
    .map((resource) => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
    }));
}

export function buildMetadataCacheEntry(options: {
  configHash: string;
  tools: ManagedTool[];
  resources: ManagedResource[];
}): McpMetadataCacheEntry {
  const serializedTools = serializeTools(options.tools);
  const serializedResources = serializeResources(options.resources);
  return {
    cachedAt: Date.now(),
    configHash: options.configHash,
    toolCount: serializedTools.length,
    resourceCount: serializedResources.length,
    tools: serializedTools,
    resources: serializedResources,
  };
}

function extractToolUiResourceUri(tool: ManagedTool): string | undefined {
  try {
    return getToolUiResourceUri({ _meta: tool._meta });
  } catch {
    return undefined;
  }
}
