import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readState, writeState } from '../state-io';
import { createDefaultGitState } from '../../shared/types';

describe('git state I/O', () => {
  let tmpDir: string;
  let statePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-state-'));
    statePath = path.join(tmpDir, 'state.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns the default state when the file is missing', async () => {
    const state = await readState(statePath);
    const expected = createDefaultGitState();

    expect(state).toMatchObject({
      ...expected,
      lastRefresh: expect.any(String),
    });
    expect(Date.parse(state.lastRefresh)).not.toBeNaN();
  });

  it('fails loud when persisted state is malformed', async () => {
    await fs.writeFile(statePath, '{not-json', 'utf8');
    await expect(readState(statePath)).rejects.toThrow(/Git app state/);
  });

  it('writes and reads back valid git state', async () => {
    const state = createDefaultGitState();
    state.currentBranch = 'main';

    await writeState(statePath, state);

    const loaded = await readState(statePath);
    expect(loaded.currentBranch).toBe('main');
  });
});
