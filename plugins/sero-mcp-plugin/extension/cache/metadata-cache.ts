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

export type McpCacheScope = 'public' | 'private';

export interface McpMetadataCacheEntry {
  cachedAt: number;
  configHash: string;
  /** The account that listed the entry. A private entry is not used for another account. */
  principalId?: string;
  /** From the server's `cacheScope`. Missing means private. */
  cacheScope?: McpCacheScope;
  /** Epoch ms from the server's `ttlMs`. Missing or null means no expiry. 0 means stale. */
  expiresAt?: number | null;
  toolCount: number;
  resourceCount: number;
  tools: CachedMcpTool[];
  resources: CachedMcpResource[];
}

export interface McpMetadataCacheDocument {
  version: 2;
  servers: Record<string, McpMetadataCacheEntry>;
}

export const DEFAULT_METADATA_CACHE: McpMetadataCacheDocument = {
  version: 2,
  servers: {},
};

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCacheEntry(raw: unknown, fromVersion1: boolean): McpMetadataCacheEntry | null {
  if (!isRecord(raw)) return null;
  return {
    cachedAt: typeof raw.cachedAt === 'number' ? raw.cachedAt : Date.now(),
    configHash: typeof raw.configHash === 'string' ? raw.configHash : '',
    principalId: typeof raw.principalId === 'string' ? raw.principalId : undefined,
    cacheScope: raw.cacheScope === 'public' ? 'public' : 'private',
    // A version 1 file has no freshness data, so its entries are stale.
    expiresAt: fromVersion1 ? 0 : typeof raw.expiresAt === 'number' ? raw.expiresAt : null,
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
  const fromVersion1 = raw.version !== 2;
  if (isRecord(raw.servers)) {
    for (const [serverName, entry] of Object.entries(raw.servers)) {
      const normalized = normalizeCacheEntry(entry, fromVersion1);
      if (normalized) {
        servers[serverName] = normalized;
      }
    }
  }

  return {
    version: 2,
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
  // Sorted server order keeps the file stable across writes.
  const servers = Object.fromEntries(Object.entries(cache.servers).sort(([left], [right]) => left.localeCompare(right)));
  await fs.writeFile(tmpPath, JSON.stringify({ ...cache, version: 2, servers }, null, 2), 'utf8');
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

/**
 * True when the entry belongs to this config and may be shown to this account.
 * With no `principalId` (the account is not known yet), only the config is checked.
 */
export function isMetadataCacheEntryValid(
  entry: McpMetadataCacheEntry | undefined,
  definition: McpServerConfig,
  principalId?: string,
): entry is McpMetadataCacheEntry {
  if (!entry || entry.configHash !== computeServerHash(definition)) return false;
  const isPrivate = entry.cacheScope !== 'public';
  return !(isPrivate && principalId && entry.principalId && entry.principalId !== principalId);
}

/** True until the server's TTL ends. An entry without a TTL stays fresh until the server reports a change. */
export function isMetadataCacheEntryFresh(entry: McpMetadataCacheEntry, now = Date.now()): boolean {
  return entry.expiresAt === undefined || entry.expiresAt === null || entry.expiresAt > now;
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

export function areMetadataCacheServersEqual(
  left: McpMetadataCacheDocument['servers'],
  right: McpMetadataCacheDocument['servers'],
): boolean {
  return stableStringify(left) === stableStringify(right);
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
