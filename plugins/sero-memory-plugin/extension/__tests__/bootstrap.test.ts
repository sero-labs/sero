import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkBootstrapStatus, USER_QUESTIONS } from '../bootstrap';

describe('memory bootstrap questions', () => {
  it('offers caveman mode in the communication step', () => {
    const communication = USER_QUESTIONS.questions.find((question) => question.id === 'communication');

    const caveman = communication?.options.find((option) => option.value === 'caveman');

    expect(caveman).toEqual(expect.objectContaining({ value: 'caveman' }));
    expect(caveman?.subQuestion?.options.map((option) => option.value)).toEqual([
      'lite',
      'full',
      'ultra',
    ]);
  });
});

describe('memory bootstrap status', () => {
  const originalSeroHome = process.env.SERO_HOME;
  let seroHome = '';
  let root = '';

  beforeEach(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-bootstrap-'));
    root = path.join(seroHome, 'workspaces', 'global');
    await mkdir(root, { recursive: true });
    process.env.SERO_HOME = seroHome;
  });

  afterEach(async () => {
    process.env.SERO_HOME = originalSeroHome;
    await rm(seroHome, { recursive: true, force: true });
  });

  async function write(name: string): Promise<void> {
    await writeFile(path.join(root, name), `# ${name}\n`);
  }

  it('needs setup until both profile files exist', async () => {
    expect((await checkBootstrapStatus()).needsBootstrap).toBe(true);

    await write('IDENTITY.md');
    expect((await checkBootstrapStatus()).needsBootstrap).toBe(true);

    await write('USER.md');
    expect((await checkBootstrapStatus()).needsBootstrap).toBe(false);
  });

  it('does not rerun setup for profiles that already have MEMORY.md', async () => {
    await write('MEMORY.md');

    expect((await checkBootstrapStatus()).needsBootstrap).toBe(false);
  });
});
