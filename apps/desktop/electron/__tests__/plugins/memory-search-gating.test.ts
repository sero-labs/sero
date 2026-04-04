import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const qmdMocks = vi.hoisted(() => ({
  searchRelevantMemories: vi.fn(),
}));

vi.mock('../../../../../plugins/sero-memory-plugin/extension/qmd', () => ({
  isQmdAvailable: () => true,
  searchRelevantMemories: qmdMocks.searchRelevantMemories,
}));

import { buildPriorityContextSplit } from '../../../../../plugins/sero-memory-plugin/extension/priority-context';

let root: string;
const originalSeroHome = process.env.SERO_HOME;

beforeAll(async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-search-gating-'));
  root = path.join(tmp, 'workspaces', 'global');
  await fs.mkdir(root, { recursive: true });
  process.env.SERO_HOME = tmp;
});

beforeEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
  qmdMocks.searchRelevantMemories.mockReset();
});

afterAll(async () => {
  process.env.SERO_HOME = originalSeroHome;
  await fs.rm(path.dirname(path.dirname(root)), { recursive: true, force: true }).catch(() => {});
});

describe('priority context search gating', () => {
  it('skips QMD retrieval entirely when includeSearch is false', async () => {
    qmdMocks.searchRelevantMemories.mockResolvedValue({
      formatted: 'should not be used',
      results: [],
    });

    const result = await buildPriorityContextSplit(
      root,
      'find prior discussion about state management',
      'session-1',
      'live',
      { includeSearch: false },
    );

    expect(qmdMocks.searchRelevantMemories).not.toHaveBeenCalled();
    expect(result.searchContext).toBe('');
  });

  it('runs QMD retrieval when includeSearch is true', async () => {
    qmdMocks.searchRelevantMemories.mockResolvedValue({
      formatted: '### Result 1\n\nUse Zustand for app state.',
      results: [],
    });

    const result = await buildPriorityContextSplit(
      root,
      'find prior discussion about state management',
      'session-2',
      'live',
      { includeSearch: true },
    );

    expect(qmdMocks.searchRelevantMemories).toHaveBeenCalledTimes(1);
    expect(qmdMocks.searchRelevantMemories).toHaveBeenCalledWith(
      'find prior discussion about state management',
    );
    expect(result.searchContext).toContain('Relevant memories');
    expect(result.searchContext).toContain('Use Zustand for app state.');
  });
});
