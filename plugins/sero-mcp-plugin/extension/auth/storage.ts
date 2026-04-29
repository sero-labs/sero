import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  getMcpOAuthClientPath,
  getMcpOAuthDir,
  getMcpOAuthFlowPath,
  getMcpOAuthServerDir,
  getMcpOAuthTokenPath,
} from '../state/paths';

export interface McpStoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  serverUrl?: string;
}

export interface McpStoredClientInfo {
  clientId: string;
  clientSecret?: string;
  clientIdIssuedAt?: number;
  clientSecretExpiresAt?: number;
  serverUrl?: string;
}

export interface McpStoredOAuthFlowState {
  oauthState?: string;
  codeVerifier?: string;
  serverUrl?: string;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

export async function readOAuthTokens(serverName: string, serverUrl?: string): Promise<McpStoredTokens | null> {
  const parsed = await readJsonFile(getMcpOAuthTokenPath(serverName));
  if (!parsed || typeof parsed.accessToken !== 'string') {
    return null;
  }
  if (serverUrl && typeof parsed.serverUrl === 'string' && parsed.serverUrl !== serverUrl) {
    return null;
  }
  return {
    accessToken: parsed.accessToken,
    refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : undefined,
    expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : undefined,
    scope: typeof parsed.scope === 'string' ? parsed.scope : undefined,
    serverUrl: typeof parsed.serverUrl === 'string' ? parsed.serverUrl : undefined,
  };
}

export async function writeOAuthTokens(serverName: string, tokens: McpStoredTokens): Promise<void> {
  await writeJsonFile(getMcpOAuthTokenPath(serverName), tokens);
}

export async function hasOAuthTokens(serverName: string, serverUrl?: string): Promise<boolean> {
  return (await readOAuthTokens(serverName, serverUrl)) !== null;
}

export async function clearOAuthTokens(serverName: string): Promise<void> {
  await fs.rm(getMcpOAuthTokenPath(serverName), { force: true });
}

export async function readOAuthClientInfo(
  serverName: string,
  serverUrl?: string,
): Promise<McpStoredClientInfo | null> {
  const parsed = await readJsonFile(getMcpOAuthClientPath(serverName));
  if (!parsed || typeof parsed.clientId !== 'string') {
    return null;
  }
  if (serverUrl && typeof parsed.serverUrl === 'string' && parsed.serverUrl !== serverUrl) {
    return null;
  }
  return {
    clientId: parsed.clientId,
    clientSecret: typeof parsed.clientSecret === 'string' ? parsed.clientSecret : undefined,
    clientIdIssuedAt: typeof parsed.clientIdIssuedAt === 'number' ? parsed.clientIdIssuedAt : undefined,
    clientSecretExpiresAt: typeof parsed.clientSecretExpiresAt === 'number' ? parsed.clientSecretExpiresAt : undefined,
    serverUrl: typeof parsed.serverUrl === 'string' ? parsed.serverUrl : undefined,
  };
}

export async function writeOAuthClientInfo(serverName: string, clientInfo: McpStoredClientInfo): Promise<void> {
  await writeJsonFile(getMcpOAuthClientPath(serverName), clientInfo);
}

export async function clearOAuthClientInfo(serverName: string): Promise<void> {
  await fs.rm(getMcpOAuthClientPath(serverName), { force: true });
}

export async function readOAuthFlowState(serverName: string): Promise<McpStoredOAuthFlowState | null> {
  const parsed = await readJsonFile(getMcpOAuthFlowPath(serverName));
  if (!parsed) {
    return null;
  }
  return {
    oauthState: typeof parsed.oauthState === 'string' ? parsed.oauthState : undefined,
    codeVerifier: typeof parsed.codeVerifier === 'string' ? parsed.codeVerifier : undefined,
    serverUrl: typeof parsed.serverUrl === 'string' ? parsed.serverUrl : undefined,
  };
}

export async function writeOAuthFlowState(serverName: string, flowState: McpStoredOAuthFlowState): Promise<void> {
  const existing = await readOAuthFlowState(serverName);
  await writeJsonFile(getMcpOAuthFlowPath(serverName), {
    ...(existing ?? {}),
    ...flowState,
  });
}

export async function clearOAuthFlowState(serverName: string): Promise<void> {
  await fs.rm(getMcpOAuthFlowPath(serverName), { force: true });
}

export async function clearOAuthCredentials(serverName: string): Promise<void> {
  await fs.rm(getMcpOAuthServerDir(serverName), { recursive: true, force: true });
}

export async function ensureOAuthDir(): Promise<string> {
  const dir = getMcpOAuthDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
