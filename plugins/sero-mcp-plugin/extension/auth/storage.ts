import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { OAuthDiscoveryState, StoredOAuthClientInformation, StoredOAuthTokens } from '@modelcontextprotocol/client';
import {
  getMcpOAuthClientPath,
  getMcpOAuthDir,
  getMcpOAuthDiscoveryPath,
  getMcpOAuthFlowPath,
  getMcpOAuthServerDir,
  getMcpOAuthTokenPath,
} from '../state/paths';

/**
 * Saved tokens: the SDK object field for field (including the `issuer`
 * stamp), with `expires_in` replaced by an absolute expiry.
 */
export interface McpSavedTokens {
  tokens: StoredOAuthTokens;
  /** Epoch seconds when the access token expires. */
  expiresAt?: number;
  serverUrl?: string;
  /** Random ID for this authorization. It partitions cached server data by account. */
  principalId?: string;
}

/** Saved client registration: the SDK object field for field, including the `issuer` stamp. */
export interface McpSavedClientInfo {
  client: StoredOAuthClientInformation;
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

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function serverMatches(parsed: Record<string, unknown>, serverUrl?: string): boolean {
  return !serverUrl || typeof parsed.serverUrl !== 'string' || parsed.serverUrl === serverUrl;
}

export async function readOAuthTokens(serverName: string, serverUrl?: string): Promise<McpSavedTokens | null> {
  const parsed = await readJsonFile(getMcpOAuthTokenPath(serverName));
  if (!parsed || !serverMatches(parsed, serverUrl)) return null;
  const meta = {
    expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : undefined,
    serverUrl: optionalString(parsed.serverUrl),
    principalId: optionalString(parsed.principalId),
  };
  if (isRecord(parsed.tokens) && typeof parsed.tokens.access_token === 'string') {
    const { expires_in: _expiresIn, ...tokens } = parsed.tokens;
    // Written by writeOAuthTokens from the SDK object, which the SDK validated.
    return { ...meta, tokens: { ...tokens, access_token: parsed.tokens.access_token, token_type: optionalString(tokens.token_type) ?? 'Bearer' } };
  }
  // Format saved before the SDK v2 upgrade: camelCase fields and no issuer.
  if (typeof parsed.accessToken !== 'string') return null;
  return {
    ...meta,
    tokens: {
      access_token: parsed.accessToken,
      token_type: 'Bearer',
      refresh_token: optionalString(parsed.refreshToken),
      scope: optionalString(parsed.scope),
    },
  };
}

export async function writeOAuthTokens(serverName: string, saved: McpSavedTokens): Promise<void> {
  const { expires_in: _expiresIn, ...tokens } = saved.tokens;
  await writeJsonFile(getMcpOAuthTokenPath(serverName), { ...saved, tokens });
}

export async function hasOAuthTokens(serverName: string, serverUrl?: string): Promise<boolean> {
  return (await readOAuthTokens(serverName, serverUrl)) !== null;
}

export async function clearOAuthTokens(serverName: string): Promise<void> {
  await fs.rm(getMcpOAuthTokenPath(serverName), { force: true });
}

export async function readOAuthClientInfo(serverName: string, serverUrl?: string): Promise<McpSavedClientInfo | null> {
  const parsed = await readJsonFile(getMcpOAuthClientPath(serverName));
  if (!parsed || !serverMatches(parsed, serverUrl)) return null;
  const savedServerUrl = optionalString(parsed.serverUrl);
  if (isRecord(parsed.client) && typeof parsed.client.client_id === 'string') {
    // Written by writeOAuthClientInfo from the SDK object, which the SDK validated.
    return { serverUrl: savedServerUrl, client: { ...parsed.client, client_id: parsed.client.client_id } };
  }
  // Format saved before the SDK v2 upgrade.
  if (typeof parsed.clientId !== 'string') return null;
  return {
    serverUrl: savedServerUrl,
    client: {
      client_id: parsed.clientId,
      client_secret: optionalString(parsed.clientSecret),
      client_id_issued_at: typeof parsed.clientIdIssuedAt === 'number' ? parsed.clientIdIssuedAt : undefined,
      client_secret_expires_at: typeof parsed.clientSecretExpiresAt === 'number' ? parsed.clientSecretExpiresAt : undefined,
    },
  };
}

export async function writeOAuthClientInfo(serverName: string, saved: McpSavedClientInfo): Promise<void> {
  await writeJsonFile(getMcpOAuthClientPath(serverName), saved);
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

export async function readOAuthDiscoveryState(serverName: string, serverUrl?: string): Promise<OAuthDiscoveryState | undefined> {
  const parsed = await readJsonFile(getMcpOAuthDiscoveryPath(serverName));
  if (!parsed || !serverMatches(parsed, serverUrl) || !isRecord(parsed.state)) return undefined;
  if (typeof parsed.state.authorizationServerUrl !== 'string') return undefined;
  // Written by writeOAuthDiscoveryState from the SDK's own discovery result.
  return parsed.state as unknown as OAuthDiscoveryState;
}

export async function writeOAuthDiscoveryState(serverName: string, state: OAuthDiscoveryState, serverUrl: string): Promise<void> {
  await writeJsonFile(getMcpOAuthDiscoveryPath(serverName), { serverUrl, state });
}

export async function clearOAuthDiscoveryState(serverName: string): Promise<void> {
  await fs.rm(getMcpOAuthDiscoveryPath(serverName), { force: true });
}

export async function clearOAuthCredentials(serverName: string): Promise<void> {
  await fs.rm(getMcpOAuthServerDir(serverName), { recursive: true, force: true });
}

export async function ensureOAuthDir(): Promise<string> {
  const dir = getMcpOAuthDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
