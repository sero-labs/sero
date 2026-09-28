import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { conversionPaths, runConversion, type ConversionStep } from '../conversion';
import { globalLocation, listEntries } from '../entry-store';
import { parseLegacyMemory } from '../legacy-memory';

const FIXTURES = path.join(__dirname, 'fixtures', 'legacy-memory');
const originalEnv = { SERO_HOME: process.env.SERO_HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };

function fixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURES, name), 'utf8');
}

describe('legacy MEMORY.md parsing', () => {
  it('takes the first id of a line with several and drops every id comment from the text', async () => {
    const entries = parseLegacyMemory(await fixture('v2-triple-id.md'));
    const pnpm = entries.find((entry) => entry.text.startsWith('Do not run pnpm install'));
    expect(pnpm?.id).toBe('mem-c19418');
    expect(pnpm?.text).not.toContain('<!--');
    expect(pnpm?.type).toBe('preference');
  });

  it('skips onboarding "none" answers', async () => {
    const entries = parseLegacyMemory(await fixture('v2-triple-id.md'));
    expect(entries.map((entry) => entry.text)).not.toContain('Nothing specific right now');
    expect(entries).toHaveLength(6);
  });

  it('turns each prose paragraph and bullet under a heading into an entry', async () => {
    const entries = parseLegacyMemory(await fixture('prose-under-headings.md'));
    expect(entries.map((entry) => [entry.type, entry.text])).toEqual([
      ['reference', 'The repo/docs are the source of truth There are important environment/setup constraints'],
      ['preference', 'Prefer functional patterns over classes'],
      ['preference', 'Prefer strong typing / explicit types'],
      ['decision', 'The staging server runs on port 4173 because 5173 clashes with the docs site dev server on the shared build machine.'],
      ['decision', 'Release notes live in docs/releases.md.'],
    ]);
    // Ids are derived from the text, so a retry produces the same files.
    expect(parseLegacyMemory(await fixture('prose-under-headings.md')).map((entry) => entry.id))
      .toEqual(entries.map((entry) => entry.id));
  });
});

describe('conversion', () => {
  let seroHome = '';

  beforeEach(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-conversion-'));
    process.env.SERO_HOME = seroHome;
    process.env.PI_CODING_AGENT_DIR = path.join(seroHome, 'agent');
    await mkdir(path.dirname(conversionPaths.source()), { recursive: true });
    await mkdir(conversionPaths.oldQmdIndexDir(), { recursive: true });
    await writeFile(path.join(conversionPaths.oldQmdIndexDir(), 'index.sqlite'), 'old index');
    await mkdir(path.dirname(conversionPaths.cronState()), { recursive: true });
    await writeFile(conversionPaths.cronState(), JSON.stringify({
      jobs: [{ name: 'memory-consolidation', schedule: '0 3 * * 0' }, { name: 'standup', schedule: '0 9 * * 1' }],
      reminders: [],
    }));
  });

  afterEach(async () => {
    process.env.SERO_HOME = originalEnv.SERO_HOME;
    process.env.PI_CODING_AGENT_DIR = originalEnv.PI_CODING_AGENT_DIR;
    await rm(seroHome, { recursive: true, force: true });
  });

  async function unsortedBodies(): Promise<string[]> {
    return (await listEntries(globalLocation(), 'unsorted')).map((entry) => entry.body).sort();
  }

  async function expectCompleted(original: string, expectedBodies: string[]): Promise<void> {
    expect(await unsortedBodies()).toEqual([...expectedBodies].sort());
    expect(existsSync(conversionPaths.source())).toBe(false);
    expect(await readFile(`${conversionPaths.source()}.v2-backup`, 'utf8')).toBe(original);
    expect(existsSync(conversionPaths.temp())).toBe(false);
    expect(existsSync(path.join(conversionPaths.oldQmdIndexDir(), 'index.sqlite'))).toBe(false);
    const cron = JSON.parse(await readFile(conversionPaths.cronState(), 'utf8')) as { jobs: Array<{ name: string }> };
    expect(cron.jobs.map((job) => job.name)).toEqual(['standup']);
    expect(existsSync(conversionPaths.marker())).toBe(true);
  }

  it('converts every fact to an unsorted global entry and keeps the original as a backup', async () => {
    const original = await fixture('v2-triple-id.md');
    await writeFile(conversionPaths.source(), original);

    expect(await runConversion()).toBe('done');

    await expectCompleted(original, parseLegacyMemory(original).map((entry) => entry.text));
  });

  it('adds a timestamp to the backup name when the plain name is taken', async () => {
    await writeFile(conversionPaths.source(), await fixture('v2-onboarding.md'));
    await writeFile(`${conversionPaths.source()}.v2-backup`, 'an older backup');

    await runConversion();

    const names = await readdir(path.dirname(conversionPaths.source()));
    expect(names.filter((name) => name.startsWith('MEMORY.md.v2-backup-'))).toHaveLength(1);
    expect(await readFile(`${conversionPaths.source()}.v2-backup`, 'utf8')).toBe('an older backup');
  });

  it('changes nothing on a second completed run', async () => {
    await writeFile(conversionPaths.source(), await fixture('prose-under-headings.md'));
    await runConversion();
    const before = await unsortedBodies();

    expect(await runConversion()).toBe('already-done');
    expect(await unsortedBodies()).toEqual(before);
  });

  it('succeeds when the old index and cron job are already gone', async () => {
    await rm(path.join(conversionPaths.oldQmdIndexDir(), 'index.sqlite'));
    await rm(conversionPaths.cronState());

    expect(await runConversion()).toBe('done');
    expect(existsSync(conversionPaths.marker())).toBe(true);
  });

  describe('recovery', () => {
    const stops: Array<[ConversionStep, number]> = [
      ['temp-written', 1],
      ['moved-one', 2],
      ['moved', 1],
      ['state-written', 1],
      ['renamed', 1],
      ['qmd-removed', 1],
      ['cron-removed', 1],
    ];

    it.each(stops)('finishes with every fact once after a stop at %s', async (step, nth) => {
      const original = await fixture('prose-under-headings.md');
      await writeFile(conversionPaths.source(), original);

      let seen = 0;
      await expect(runConversion((reached) => {
        if (reached === step && ++seen === nth) throw new Error(`stopped at ${step}`);
      })).rejects.toThrow(`stopped at ${step}`);

      expect(await runConversion()).toBe('done');
      await expectCompleted(original, parseLegacyMemory(original).map((entry) => entry.text));
    });
  });
});
