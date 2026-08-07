import { describe, expect, it } from 'vitest';
import { areMetadataCacheServersEqual, type McpMetadataCacheEntry } from '../cache/metadata-cache';

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
