import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readState, writeState } from '../state-io';
import { createDefaultKanbanState } from '../../shared/types';

describe('kanban state I/O', () => {
  let tmpDir: string;
  let statePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-state-'));
    statePath = path.join(tmpDir, 'state.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns the default state when the file is missing', async () => {
    const state = await readState(statePath);
    expect(state).toEqual(createDefaultKanbanState());
  });

  it('fails loud when persisted state is malformed', async () => {
    await fs.writeFile(statePath, '{not-json', 'utf8');
    await expect(readState(statePath)).rejects.toThrow(/Kanban board state/);
  });

  it('writes and reads back valid board state', async () => {
    const state = createDefaultKanbanState();
    state.cards.push({
      id: '1',
      title: 'Fix persisted state handling',
      description: '',
      priority: 'high',
      column: 'backlog',
      acceptance: [],
      blockedBy: [],
      subtasks: [],
      status: 'idle',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await writeState(statePath, state);

    const loaded = await readState(statePath);
    expect(loaded.cards).toHaveLength(1);
    expect(loaded.cards[0]?.title).toBe('Fix persisted state handling');
  });
});
