import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getMcpOAuthDir, getMcpOAuthTokenPath } from '../state/paths';

export type McpStoredTokens = Record<string, unknown>;

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

export async function readOAuthTokens(serverName: string): Promise<McpStoredTokens | null> {
  try {
    const raw = await fs.readFile(getMcpOAuthTokenPath(serverName), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as McpStoredTokens;
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

export async function writeOAuthTokens(serverName: string, tokens: McpStoredTokens): Promise<void> {
  await writeJsonFile(getMcpOAuthTokenPath(serverName), tokens);
}

export async function clearOAuthTokens(serverName: string): Promise<void> {
  await fs.rm(path.dirname(getMcpOAuthTokenPath(serverName)), { recursive: true, force: true });
}

export async function ensureOAuthDir(): Promise<string> {
  const dir = getMcpOAuthDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
