import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  clearDoneScratchpadItems,
  getOpenScratchpadItems,
  getScratchpadPath,
  parseScratchpad,
  serializeScratchpad,
} from '../scratchpad';

let root: string;
const originalSeroHome = process.env.SERO_HOME;

beforeAll(async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-scratchpad-test-'));
  root = path.join(tmp, 'workspaces', 'global');
  await fs.mkdir(root, { recursive: true });
  process.env.SERO_HOME = tmp;
});

beforeEach(async () => {
  // Wipe any leftover scratchpad between cases.
  const scratchpadPath = getScratchpadPath();
  await fs.rm(scratchpadPath, { force: true });
});

afterAll(async () => {
  process.env.SERO_HOME = originalSeroHome;
  await fs.rm(path.dirname(path.dirname(root)), { recursive: true, force: true }).catch(() => {});
});

async function writeScratchpad(content: string): Promise<void> {
  await fs.writeFile(getScratchpadPath(), content, 'utf8');
}

describe('clearDoneScratchpadItems', () => {
  it('returns 0 when SCRATCHPAD.md does not exist', async () => {
    expect(await clearDoneScratchpadItems()).toBe(0);
  });

  it('removes done items, keeps open items, and reports the count removed', async () => {
    const items = [
      { done: false, text: 'open A', meta: '' },
      { done: true, text: 'done X', meta: '' },
      { done: false, text: 'open B', meta: '' },
      { done: true, text: 'done Y', meta: '' },
    ];
    await writeScratchpad(serializeScratchpad(items));

    const removed = await clearDoneScratchpadItems();
    expect(removed).toBe(2);

    const remaining = parseScratchpad(
      await fs.readFile(getScratchpadPath(), 'utf8'),
    );
    expect(remaining.map((i) => i.text)).toEqual(['open A', 'open B']);
    expect(remaining.every((i) => !i.done)).toBe(true);
  });

  it('is a no-op when all items are still open', async () => {
    await writeScratchpad(serializeScratchpad([
      { done: false, text: 'open A', meta: '' },
      { done: false, text: 'open B', meta: '' },
    ]));

    expect(await clearDoneScratchpadItems()).toBe(0);
    const remaining = await getOpenScratchpadItems();
    expect(remaining).toHaveLength(2);
  });
});
