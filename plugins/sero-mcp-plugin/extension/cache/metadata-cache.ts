import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getMcpMetadataCachePath } from '../state/paths';

export interface McpMetadataCacheEntry {
  cachedAt: number;
  toolCount?: number;
  resourceCount?: number;
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

function normalizeCache(raw: unknown): McpMetadataCacheDocument {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_METADATA_CACHE };
  }

  const parsed = raw as Partial<McpMetadataCacheDocument>;
  return {
    version: 1,
    servers: parsed.servers && typeof parsed.servers === 'object' && !Array.isArray(parsed.servers)
      ? parsed.servers
      : {},
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
