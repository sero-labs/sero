import { getToolUiResourceUri, isToolVisibilityAppOnly } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { CachedMcpResource, CachedMcpTool, McpMetadataCacheEntry } from '../cache/metadata-cache';
import type { ManagedCacheHints } from './types';
import type { ManagedResource, ManagedTool } from './types';

/** The tools that the model sees. A tool with visibility ["app"] is only for the server's MCP app. */
export function serializeTools(tools: ManagedTool[]): CachedMcpTool[] {
  return tools
    .filter((tool) => !!tool?.name && !isToolVisibilityAppOnly({ _meta: tool._meta }))
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
  principalId?: string;
  cacheHints?: ManagedCacheHints;
}): McpMetadataCacheEntry {
  const serializedTools = serializeTools(options.tools);
  const serializedResources = serializeResources(options.resources);
  const cachedAt = Date.now();
  const ttlMs = options.cacheHints?.ttlMs;
  return {
    cachedAt,
    configHash: options.configHash,
    principalId: options.principalId,
    cacheScope: options.cacheHints?.scope ?? 'private',
    expiresAt: typeof ttlMs === 'number' ? cachedAt + ttlMs : null,
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
