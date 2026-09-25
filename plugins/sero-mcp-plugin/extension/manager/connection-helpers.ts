import { getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import { Client, SdkHttpError } from '@modelcontextprotocol/client';
import path from 'node:path';
import type { McpServerConfig } from '../config/types';
import type { ManagedCacheHints, ManagedConnectionProtocol, ManagedResource, ManagedTool } from './types';

/** True when the Streamable HTTP endpoint does not exist (HTTP 404 or 405), also when the SDK wraps the error. */
export function isMissingEndpointError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (current instanceof SdkHttpError) {
      return current.status === 404 || current.status === 405;
    }
    current = current.cause;
  }
  return false;
}

/** Reads the `ttlMs` and `cacheScope` hints that a 2026-07-28 server puts on a list result. */
export function readCacheHints(result: object): ManagedCacheHints {
  const ttlMs: unknown = Reflect.get(result, 'ttlMs');
  return {
    ttlMs: typeof ttlMs === 'number' && ttlMs >= 0 ? ttlMs : null,
    scope: Reflect.get(result, 'cacheScope') === 'public' ? 'public' : 'private',
  };
}

export function mergeCacheHints(tools: ManagedCacheHints, resources: ManagedCacheHints | null): ManagedCacheHints {
  if (!resources) return tools;
  const ttls = [tools.ttlMs, resources.ttlMs].filter((ttl): ttl is number => ttl !== null);
  return {
    ttlMs: ttls.length > 0 ? Math.min(...ttls) : null,
    scope: tools.scope === 'public' && resources.scope === 'public' ? 'public' : 'private',
  };
}

export function readProtocol(client: Client, deprecatedTransport: boolean, eraFromVerdict: boolean): ManagedConnectionProtocol {
  const serverVersion = client.getServerVersion();
  return {
    era: client.getProtocolEra() ?? 'legacy',
    version: client.getNegotiatedProtocolVersion() ?? null,
    extensions: Object.keys(client.getServerCapabilities()?.extensions ?? {}).sort(),
    serverVersion: serverVersion ? { name: serverVersion.name, version: serverVersion.version } : null,
    deprecatedTransport,
    eraFromVerdict,
  };
}

export function resolveEnv(env: Record<string, string> | undefined, literal: boolean): Record<string, string> | undefined {
  if (!env) return undefined;
  const resolved = literal
    ? env
    : Object.fromEntries(
        Object.entries(env).map(([key, value]) => [key, expandEnvReferences(value)]),
      );
  return literal ? { ...getDefaultEnvironment(), ...resolved } : resolved;
}

function expandEnvReferences(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, key: string) => process.env[key] ?? '');
}

export function buildRequestInit(
  definition: McpServerConfig,
  bearerToken?: string,
): { headers?: Record<string, string>; redirect?: 'manual' } | undefined {
  const headers: Record<string, string> = { ...(definition.headers ?? {}) };
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }
  const redirect = definition.managedByAgentPlugin ? { redirect: 'manual' as const } : {};
  return Object.keys(headers).length > 0
    ? { headers, ...redirect }
    : definition.managedByAgentPlugin ? redirect : undefined;
}

export function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function normalizeTools(rawTools: unknown): ManagedTool[] {
  if (!Array.isArray(rawTools)) return [];
  return rawTools
    .filter((tool): tool is Record<string, unknown> => !!tool && typeof tool === 'object' && !Array.isArray(tool))
    .map((tool) => ({
      name: typeof tool.name === 'string' ? tool.name : '',
      description: typeof tool.description === 'string' ? tool.description : undefined,
      inputSchema: tool.inputSchema,
      _meta: tool._meta && typeof tool._meta === 'object' ? tool._meta as Record<string, unknown> : undefined,
    }))
    .filter((tool) => tool.name.length > 0);
}

export function normalizeResources(rawResources: unknown): ManagedResource[] {
  if (!Array.isArray(rawResources)) return [];
  return rawResources
    .filter((resource): resource is Record<string, unknown> => !!resource && typeof resource === 'object' && !Array.isArray(resource))
    .map((resource) => ({
      uri: typeof resource.uri === 'string' ? resource.uri : '',
      name: typeof resource.name === 'string' ? resource.name : '',
      description: typeof resource.description === 'string' ? resource.description : undefined,
      mimeType: typeof resource.mimeType === 'string' ? resource.mimeType : undefined,
      _meta: resource._meta && typeof resource._meta === 'object' ? resource._meta as Record<string, unknown> : undefined,
    }))
    .filter((resource) => resource.uri.length > 0 && resource.name.length > 0);
}
