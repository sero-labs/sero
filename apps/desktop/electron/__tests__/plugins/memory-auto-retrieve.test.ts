/**
 * Auto-retrieve configuration tests.
 *
 * Verifies the auto_retrieve setting in memory config and the
 * handleMemoryConfig admin function.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  getAutoRetrieveModeSync,
  setAutoRetrieveModeSync,
  describeAutoRetrieveMode,
  getMemorySnapshotModeSync,
} from '@plugins/sero-memory-plugin/extension/memory-config';
import { handleMemoryConfig } from '@plugins/sero-memory-plugin/extension/memory-tool-admin';

let tmpDir: string;
const originalSeroHome = process.env.SERO_HOME;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-auto-retrieve-'));
  process.env.SERO_HOME = tmpDir;
});

beforeEach(async () => {
  // Clean config between tests
  const configDir = path.join(tmpDir, 'state', 'memory');
  await fs.rm(configDir, { recursive: true, force: true });
});

afterAll(async () => {
  process.env.SERO_HOME = originalSeroHome;
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe('Auto-retrieve config', () => {
  it('defaults to on', () => {
    expect(getAutoRetrieveModeSync()).toBe('on');
  });

  it('can be set to off', () => {
    const result = setAutoRetrieveModeSync('off');
    expect(result).toBe('off');
    expect(getAutoRetrieveModeSync()).toBe('off');
  });

  it('can be toggled back to on', () => {
    setAutoRetrieveModeSync('off');
    setAutoRetrieveModeSync('on');
    expect(getAutoRetrieveModeSync()).toBe('on');
  });

  it('normalizes invalid values to default', () => {
    const result = setAutoRetrieveModeSync('invalid' as any);
    expect(result).toBe('on');
  });

  it('respects SERO_MEMORY_AUTO_RETRIEVE env var', () => {
    process.env.SERO_MEMORY_AUTO_RETRIEVE = 'off';
    try {
      expect(getAutoRetrieveModeSync()).toBe('off');
    } finally {
      delete process.env.SERO_MEMORY_AUTO_RETRIEVE;
    }
  });

  it('has descriptive labels', () => {
    expect(describeAutoRetrieveMode('on')).toContain('auto-retrieved');
    expect(describeAutoRetrieveMode('off')).toContain('memory_search');
  });
});

describe('handleMemoryConfig with auto_retrieve', () => {
  it('shows current config when called with no args', () => {
    const result = handleMemoryConfig(undefined, undefined);
    const text = result.content[0]!.text;
    expect(text).toContain('snapshot');
    expect(text).toContain('Auto-retrieve');
  });

  it('sets auto_retrieve independently', () => {
    const result = handleMemoryConfig(undefined, 'off');
    const text = result.content[0]!.text;
    expect(text).toContain('Auto-retrieve set to off');
    expect(getAutoRetrieveModeSync()).toBe('off');
  });

  it('sets both snapshot and auto_retrieve together', () => {
    const result = handleMemoryConfig('live', 'off');
    const text = result.content[0]!.text;
    expect(text).toContain('live');
    expect(text).toContain('Auto-retrieve set to off');
    expect(getMemorySnapshotModeSync()).toBe('live');
    expect(getAutoRetrieveModeSync()).toBe('off');
  });
});
