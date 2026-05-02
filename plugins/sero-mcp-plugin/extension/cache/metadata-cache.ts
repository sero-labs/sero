import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { McpServerConfig } from '../config/types';
import { getMcpMetadataCachePath } from '../state/paths';

export interface CachedMcpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  uiResourceUri?: string;
}

export interface CachedMcpResource {
  uri: string;
  name: string;
  description?: string;
}

export interface McpMetadataCacheEntry {
  cachedAt: number;
  configHash: string;
  toolCount: number;
  resourceCount: number;
  tools: CachedMcpTool[];
  resources: CachedMcpResource[];
}

export interface McpMetadataCacheDocument {
  version: 1;
  servers: Record<string, McpMetadataCacheEntry>;
}

export const DEFAULT_METADATA_CACHE: McpMetadataCacheDocument = {
  version: 1,
  servers: {},
};

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCacheEntry(raw: unknown): McpMetadataCacheEntry | null {
  if (!isRecord(raw)) return null;
  return {
    cachedAt: typeof raw.cachedAt === 'number' ? raw.cachedAt : Date.now(),
    configHash: typeof raw.configHash === 'string' ? raw.configHash : '',
    toolCount: typeof raw.toolCount === 'number' ? raw.toolCount : 0,
    resourceCount: typeof raw.resourceCount === 'number' ? raw.resourceCount : 0,
    tools: Array.isArray(raw.tools) ? raw.tools.filter(isRecord).map((tool) => ({
      name: typeof tool.name === 'string' ? tool.name : '',
      description: typeof tool.description === 'string' ? tool.description : undefined,
      inputSchema: tool.inputSchema,
      uiResourceUri: typeof tool.uiResourceUri === 'string' ? tool.uiResourceUri : undefined,
    })).filter((tool) => tool.name.length > 0) : [],
    resources: Array.isArray(raw.resources) ? raw.resources.filter(isRecord).map((resource) => ({
      uri: typeof resource.uri === 'string' ? resource.uri : '',
      name: typeof resource.name === 'string' ? resource.name : 'Resource',
      description: typeof resource.description === 'string' ? resource.description : undefined,
    })).filter((resource) => resource.uri.length > 0) : [],
  };
}

function normalizeCache(raw: unknown): McpMetadataCacheDocument {
  if (!isRecord(raw)) {
    return { ...DEFAULT_METADATA_CACHE };
  }

  const servers: Record<string, McpMetadataCacheEntry> = {};
  if (isRecord(raw.servers)) {
    for (const [serverName, entry] of Object.entries(raw.servers)) {
      const normalized = normalizeCacheEntry(entry);
      if (normalized) {
        servers[serverName] = normalized;
      }
    }
  }

  return {
    version: 1,
    servers,
  };
}

export async function readMetadataCache(filePath = getMcpMetadataCachePath()): Promise<McpMetadataCacheDocument> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeCache(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) {
      return { ...DEFAULT_METADATA_CACHE };
    }
    throw error;
  }
}

export async function writeMetadataCache(
  cache: McpMetadataCacheDocument,
  filePath = getMcpMetadataCachePath(),
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(cache, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

export function computeServerHash(definition: McpServerConfig): string {
  const identity: Record<string, unknown> = {
    transport: definition.transport,
    command: definition.command,
    args: definition.args,
    env: definition.env,
    cwd: definition.cwd,
    url: definition.url,
    headers: definition.headers,
    auth: definition.auth,
    bearerToken: definition.bearerToken,
    bearerTokenEnv: definition.bearerTokenEnv,
    oauth: definition.oauth,
    exposeResources: definition.exposeResources,
    excludeTools: definition.excludeTools,
  };
  return createHash('sha256').update(stableStringify(identity)).digest('hex');
}

export function isMetadataCacheEntryValid(
  entry: McpMetadataCacheEntry | undefined,
  definition: McpServerConfig,
): boolean {
  return !!entry && entry.configHash === computeServerHash(definition);
}

export function setMetadataCacheEntry(
  cache: McpMetadataCacheDocument,
  serverName: string,
  entry: McpMetadataCacheEntry,
): McpMetadataCacheDocument {
  return {
    ...cache,
    servers: {
      ...cache.servers,
      [serverName]: entry,
    },
  };
}

export function removeMetadataCacheEntry(
  cache: McpMetadataCacheDocument,
  serverName: string,
): McpMetadataCacheDocument {
  const nextServers = { ...cache.servers };
  delete nextServers[serverName];
  return {
    ...cache,
    servers: nextServers,
  };
}

export function createEmptyMetadataCache(): McpMetadataCacheDocument {
  return { ...DEFAULT_METADATA_CACHE, servers: {} };
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? 'undefined' : serialized;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}
