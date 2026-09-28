import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A parser that loses a fact, which the completeness check must catch.
vi.mock('../legacy-memory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../legacy-memory')>();
  return {
    ...actual,
    parseLegacyMemory: (content: string) => actual.parseLegacyMemory(content).slice(1),
  };
});
vi.mock('../logger', () => ({ error: vi.fn(async () => undefined) }));

import { conversionPaths, runConversion } from '../conversion';
import { globalLocation, listEntries } from '../entry-store';
import { buildSnapshot } from '../snapshot';

const originalSeroHome = process.env.SERO_HOME;

describe('conversion completeness check', () => {
  let seroHome = '';

  beforeEach(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-conversion-check-'));
    process.env.SERO_HOME = seroHome;
  });

  afterEach(async () => {
    process.env.SERO_HOME = originalSeroHome;
    await rm(seroHome, { recursive: true, force: true });
  });

  it('leaves MEMORY.md in place and converts nothing when a fact is missing', async () => {
    const original = await readFile(path.join(__dirname, 'fixtures', 'legacy-memory', 'v2-onboarding.md'), 'utf8');
    await mkdir(path.dirname(conversionPaths.source()), { recursive: true });
    await writeFile(conversionPaths.source(), original);

    expect(await runConversion()).toBe('failed-check');

    expect(await readFile(conversionPaths.source(), 'utf8')).toBe(original);
    expect(await listEntries(globalLocation(), 'unsorted')).toEqual([]);
    expect(existsSync(conversionPaths.temp())).toBe(false);
    expect(existsSync(conversionPaths.marker())).toBe(false);

    const { text } = await buildSnapshot(path.join(seroHome, 'project'));
    expect(text).toContain('### Unsorted memories');
    expect(text).toContain('Prefer OOP / class-based');
  });
});
