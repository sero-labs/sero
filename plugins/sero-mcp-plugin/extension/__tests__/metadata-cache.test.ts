import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  areMetadataCacheServersEqual,
  computeServerHash,
  isMetadataCacheEntryFresh,
  isMetadataCacheEntryValid,
  readMetadataCache,
  writeMetadataCache,
  type McpMetadataCacheEntry,
} from '../cache/metadata-cache';
import type { McpServerConfig } from '../config/types';

function entry(configHash: string): McpMetadataCacheEntry {
  return {
    cachedAt: 1,
    configHash,
    toolCount: 0,
    resourceCount: 0,
    tools: [],
    resources: [],
  };
}

describe('MCP metadata cache comparison', () => {
  it('ignores server key order', () => {
    expect(areMetadataCacheServersEqual(
      { alpha: entry('a'), beta: entry('b') },
      { beta: entry('b'), alpha: entry('a') },
    )).toBe(true);
  });

  it('detects changed server metadata', () => {
    expect(areMetadataCacheServersEqual(
      { alpha: entry('a') },
      { alpha: entry('changed') },
    )).toBe(false);
  });
});

describe('MCP metadata cache version 2', () => {
  const config: McpServerConfig = { transport: 'http', url: 'https://mcp.example.com/mcp', auth: 'oauth' };
  const hash = computeServerHash(config);
  const cached = (overrides: Partial<McpMetadataCacheEntry>): McpMetadataCacheEntry => ({ ...entry(hash), ...overrides });

  it('keeps an entry fresh until its TTL ends', () => {
    const now = 10_000;
    expect(isMetadataCacheEntryFresh(cached({ expiresAt: now + 1 }), now)).toBe(true);
    expect(isMetadataCacheEntryFresh(cached({ expiresAt: now }), now)).toBe(false);
    expect(isMetadataCacheEntryFresh(cached({ expiresAt: null }), now)).toBe(true);
  });

  it('ignores a private entry that another account listed', () => {
    expect(isMetadataCacheEntryValid(cached({ principalId: 'oauth:a', cacheScope: 'private' }), config, 'oauth:a')).toBe(true);
    expect(isMetadataCacheEntryValid(cached({ principalId: 'oauth:a', cacheScope: 'private' }), config, 'oauth:b')).toBe(false);
    expect(isMetadataCacheEntryValid(cached({ principalId: 'oauth:a', cacheScope: 'public' }), config, 'oauth:b')).toBe(true);
  });

  it('writes servers in a stable order and reads a version 1 file as stale', async () => {
    const filePath = path.join(await mkdtemp(path.join(tmpdir(), 'mcp-cache-')), 'metadata-cache.json');
    await writeMetadataCache({ version: 2, servers: { zeta: cached({}), alpha: cached({}) } }, filePath);
    const written = JSON.parse(await readFile(filePath, 'utf8'));
    expect(written.version).toBe(2);
    expect(Object.keys(written.servers)).toEqual(['alpha', 'zeta']);

    await writeFile(filePath, JSON.stringify({ version: 1, servers: { old: entry(hash) } }));
    const upgraded = await readMetadataCache(filePath);
    expect(upgraded.version).toBe(2);
    expect(upgraded.servers.old?.expiresAt).toBe(0);
    expect(isMetadataCacheEntryFresh(upgraded.servers.old!)).toBe(false);
  });
});
