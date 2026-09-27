import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveMetricsPath } from '../metrics';
import { memoryRegistry } from '../registry';
import { executeScratchpad, scratchpadPath } from '../scratchpad';

const originalSeroHome = process.env.SERO_HOME;

describe('scratchpad tool', () => {
  let seroHome = '';
  let workspace = '';

  beforeEach(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-scratchpad-'));
    workspace = path.join(seroHome, 'project');
    await mkdir(workspace);
    process.env.SERO_HOME = seroHome;
    memoryRegistry().gitChecks.clear();
  });

  afterEach(async () => {
    process.env.SERO_HOME = originalSeroHome;
    await rm(seroHome, { recursive: true, force: true });
  });

  it('keeps a checklist file and returns the full list after every change', async () => {
    await executeScratchpad(workspace, 's1', { action: 'add', text: 'Migrate the auth tests' });
    const afterAdd = await executeScratchpad(workspace, 's1', { action: 'add', text: 'Ask about the release date' });
    expect(afterAdd).toBe('Scratchpad (2 open):\n1. [ ] Migrate the auth tests\n2. [ ] Ask about the release date');

    const afterDone = await executeScratchpad(workspace, 's1', { action: 'done', item: 1 });
    expect(afterDone).toBe('Scratchpad (1 open):\n1. [x] Migrate the auth tests\n2. [ ] Ask about the release date');
    expect(await readFile(scratchpadPath(workspace), 'utf8'))
      .toBe('- [x] Migrate the auth tests\n- [ ] Ask about the release date\n');

    expect(await executeScratchpad(workspace, 's1', { action: 'undo', item: 1 })).toContain('1. [ ] Migrate the auth tests');
    expect(await executeScratchpad(workspace, 's1', { action: 'list' })).toContain('(2 open)');
  });

  it('rejects an item number that is not in the list', async () => {
    await executeScratchpad(workspace, 's1', { action: 'add', text: 'One item' });
    expect(await executeScratchpad(workspace, 's1', { action: 'done', item: 4 })).toMatch(/^Error: item must be a number from 1 to 1/);
  });

  it('records a metric for each change', async () => {
    await executeScratchpad(workspace, 's1', { action: 'add', text: 'One item' });
    await executeScratchpad(workspace, 's1', { action: 'done', item: 1 });

    const events = (await readFile(resolveMetricsPath(), 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.map((event) => [event.event, event.action, event.open])).toEqual([
      ['scratchpad', 'add', 1],
      ['scratchpad', 'done', 0],
    ]);
  });
});
