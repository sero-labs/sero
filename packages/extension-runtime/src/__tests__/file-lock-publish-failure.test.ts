import type { PathLike } from 'node:fs';
import type * as FsPromises from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const failLink = vi.hoisted(() => vi.fn());

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    link: async (existingPath: PathLike, newPath: PathLike) => {
      if (failLink()) {
        const error = new Error('hard links are not supported') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }
      return actual.link(existingPath, newPath);
    },
  };
});

import { acquireLock } from '../file-lock';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sero-file-lock-publish-failure-'));
  failLink.mockReturnValue(true);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

it('removes its empty reservation when owner publication fails', async () => {
  const lockDir = path.join(dir, 'state.json.lock');

  await expect(acquireLock(lockDir)).rejects.toMatchObject({ code: 'EPERM' });
  expect(existsSync(lockDir)).toBe(false);
});
