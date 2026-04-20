import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getMcpConfigPath } from '../state/paths';
import type { McpConfigDocument, McpConfigSettings, McpOAuthConfig, McpServerConfig } from './types';
import { createDefaultMcpConfig } from './types';

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function normalizeOAuthConfig(value: unknown): McpOAuthConfig | false | undefined {
  if (value === false) return false;
  if (!isRecord(value)) return undefined;
  const next: McpOAuthConfig = { ...value };
  if (value.grantType === 'authorization_code' || value.grantType === 'client_credentials') {
    next.grantType = value.grantType;
  }
  if (typeof value.clientId === 'string') next.clientId = value.clientId;
  if (typeof value.clientSecret === 'string') next.clientSecret = value.clientSecret;
  if (typeof value.scope === 'string') next.scope = value.scope;
  return next;
}

function normalizeSettings(value: unknown): McpConfigSettings {
  const defaults = createDefaultMcpConfig().settings ?? {};
  if (!isRecord(value)) return { ...defaults };
  return {
    ...value,
    idleTimeout: typeof value.idleTimeout === 'number' ? value.idleTimeout : defaults.idleTimeout,
    toolPrefix:
      value.toolPrefix === 'server' || value.toolPrefix === 'short' || value.toolPrefix === 'none'
        ? value.toolPrefix
        : defaults.toolPrefix,
  };
}

function normalizeServerConfig(value: unknown): McpServerConfig | null {
  if (!isRecord(value)) return null;
  const next: McpServerConfig = { ...value };
  if (typeof value.enabled === 'boolean') next.enabled = value.enabled;
  if (typeof value.command === 'string') next.command = value.command;
  if (typeof value.cwd === 'string') next.cwd = value.cwd;
  if (typeof value.url === 'string') next.url = value.url;
  if (typeof value.bearerToken === 'string') next.bearerToken = value.bearerToken;
  if (typeof value.bearerTokenEnv === 'string') next.bearerTokenEnv = value.bearerTokenEnv;
  if (value.auth === 'oauth' || value.auth === 'bearer' || value.auth === false) next.auth = value.auth;
  if (value.lifecycle === 'lazy' || value.lifecycle === 'eager' || value.lifecycle === 'keep-alive') {
    next.lifecycle = value.lifecycle;
  }
  if (typeof value.idleTimeout === 'number') next.idleTimeout = value.idleTimeout;
  if (typeof value.exposeResources === 'boolean') next.exposeResources = value.exposeResources;
  if (typeof value.debug === 'boolean') next.debug = value.debug;
  const args = normalizeStringArray(value.args);
  if (args) next.args = args;
  const excludeTools = normalizeStringArray(value.excludeTools);
  if (excludeTools) next.excludeTools = excludeTools;
  const env = normalizeStringRecord(value.env);
  if (env) next.env = env;
  const headers = normalizeStringRecord(value.headers);
  if (headers) next.headers = headers;
  const oauth = normalizeOAuthConfig(value.oauth);
  if (oauth !== undefined) next.oauth = oauth;
  return next;
}

export function normalizeConfigDocument(raw: unknown): McpConfigDocument {
  const defaults = createDefaultMcpConfig();
  if (!isRecord(raw)) return defaults;

  const servers: Record<string, McpServerConfig> = {};
  if (isRecord(raw.mcpServers)) {
    for (const [serverName, serverConfig] of Object.entries(raw.mcpServers)) {
      const normalized = normalizeServerConfig(serverConfig);
      if (normalized) {
        servers[serverName] = normalized;
      }
    }
  }

  return {
    ...raw,
    settings: normalizeSettings(raw.settings),
    mcpServers: servers,
  };
}

export async function readConfig(filePath = getMcpConfigPath()): Promise<McpConfigDocument> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeConfigDocument(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) {
      return createDefaultMcpConfig();
    }
    throw error;
  }
}

export async function writeConfig(config: McpConfigDocument, filePath = getMcpConfigPath()): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

export async function ensureConfigFile(filePath = getMcpConfigPath()): Promise<McpConfigDocument> {
  const config = await readConfig(filePath);
  await writeConfig(config, filePath);
  return config;
}

export async function readRawConfig(filePath = getMcpConfigPath()): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      const config = createDefaultMcpConfig();
      return `${JSON.stringify(config, null, 2)}\n`;
    }
    throw error;
  }
}

export async function getConfigUpdatedAt(filePath = getMcpConfigPath()): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtime.toISOString();
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}
