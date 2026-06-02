import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseMemoryEntries } from '../memory-format';
import {
  handleRead,
  handleRemove,
  handleReplace,
  handleWrite,
} from '../memory-tool';
import { getMemoryPath, getUserPath } from '../memory-manager';

function getText(result: Awaited<ReturnType<typeof handleWrite>>): string {
  const firstBlock = result.content[0];
  return firstBlock?.type === 'text' ? firstBlock.text : '';
}

describe('memory tool CRUD semantics', () => {
  const originalEnv = {
    SERO_HOME: process.env.SERO_HOME,
    PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
  };

  let seroHome = '';
  let root = '';

  beforeEach(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-tool-'));
    root = path.join(seroHome, 'workspaces', 'global');
    process.env.SERO_HOME = seroHome;
    delete process.env.PI_CODING_AGENT_DIR;
  });

  afterEach(async () => {
    process.env.SERO_HOME = originalEnv.SERO_HOME;
    process.env.PI_CODING_AGENT_DIR = originalEnv.PI_CODING_AGENT_DIR;
    await rm(seroHome, { recursive: true, force: true });
  });

  it('preserves entry ids across replace/remove and blocks duplicate writes', async () => {
    const firstWrite = await handleWrite(root, 'memory', 'Remember the staging server uses port 4173.');
    expect(getText(firstWrite)).toBe('Appended to MEMORY.md');

    const secondWrite = await handleWrite(root, 'memory', 'The release checklist lives in docs/releases.md.', 'append', undefined, 'decision');
    expect(getText(secondWrite)).toBe('Appended to MEMORY.md');

    const memoryPath = getMemoryPath(root);
    let entries = parseMemoryEntries(await readFile(memoryPath, 'utf8'));
    expect(entries).toHaveLength(2);
    const [firstEntry, secondEntry] = entries;

    const duplicateWrite = await handleWrite(root, 'memory', firstEntry!.text);
    expect(getText(duplicateWrite)).toContain(`Error: This content already exists in MEMORY.md (entry ${firstEntry!.id}).`);

    const replaceResult = await handleReplace(root, 'memory', firstEntry!.id, 'Remember the staging server uses port 4273.');
    expect(getText(replaceResult)).toBe(`Replaced entry ${firstEntry!.id} in MEMORY.md`);

    entries = parseMemoryEntries(await readFile(memoryPath, 'utf8'));
    expect(entries.map((entry) => entry.id)).toEqual([firstEntry!.id, secondEntry!.id]);
    expect(entries[0]!.text).toBe('Remember the staging server uses port 4273.');
    expect(entries[1]!.type).toBe('decision');

    const removeResult = await handleRemove(root, 'memory', secondEntry!.id);
    expect(getText(removeResult)).toBe(`Removed entry ${secondEntry!.id} from MEMORY.md.`);

    entries = parseMemoryEntries(await readFile(memoryPath, 'utf8'));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe(firstEntry!.id);

    const readWithIds = await handleRead(root, 'memory', undefined, true);
    expect(getText(readWithIds)).toContain(`<!-- id: ${firstEntry!.id} -->`);
  });

  it('enforces the MEMORY.md visible-capacity limit before writing', async () => {
    const writeResult = await handleWrite(root, 'memory', 'x'.repeat(4_001));

    expect(getText(writeResult)).toMatch(
      /^Error: MEMORY\.md would exceed capacity \(\d+\/4000 chars\)\. Current usage: 100%\. Replace, remove, or consolidate content before adding more\.$/,
    );

    const readResult = await handleRead(root, 'memory');
    expect(getText(readResult)).toBe('MEMORY.md not found or empty.');
  });

  it('updates existing USER.md fields instead of appending conflicting profile lines', async () => {
    await handleWrite(root, 'user', '# User\n\n- **Name:** Dan\n- **Communication:** Caveman mode — compressed replies\n- **Caveman Mode:** full', 'overwrite');

    const updateResult = await handleWrite(
      root,
      'user',
      'Communication: Normal concise style\nCaveman Mode: off',
    );

    expect(getText(updateResult)).toBe('Updated USER.md (Communication, Caveman Mode)');
    const content = await readFile(getUserPath(root), 'utf8');
    expect(content).toContain('- **Communication:** Normal concise style');
    expect(content).toContain('- **Caveman Mode:** off');
    expect(content).not.toContain('Caveman mode — compressed replies');
    expect(content.match(/Communication:/g)).toHaveLength(1);
  });

  it('still appends USER.md notes that are not field updates', async () => {
    await handleWrite(root, 'user', '# User\n\n- **Name:** Dan', 'overwrite');

    const appendResult = await handleWrite(root, 'user', 'Prefers short implementation notes.');

    expect(getText(appendResult)).toBe('Appended to USER.md');
    const content = await readFile(getUserPath(root), 'utf8');
    expect(content).toContain('Prefers short implementation notes.');
  });
});
