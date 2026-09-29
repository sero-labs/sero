import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { tokenizeCliInput } from '../../../../apps/desktop/electron/cli/core/parser';
import { buildBootstrapInstructions, checkBootstrapStatus, USER_QUESTIONS } from '../bootstrap';
import { conversionPaths } from '../conversion';
import { getIdentityPath, getMemoryPath, getUserPath, resolveMemoryRoot } from '../memory-manager';
import { createSession } from './harness';

const originalSeroHome = process.env.SERO_HOME;

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

  it('asks for coding style in the user step and writes it to USER.md, not to long-term memory', () => {
    const codingStyle = USER_QUESTIONS.questions.find((question) => question.id === 'coding_style');
    expect(codingStyle?.multiSelect).toBe(true);
    expect(codingStyle?.options.map((option) => option.label)).toContain('Prefer strong typing / explicit types');

    const instructions = buildBootstrapInstructions(null);
    expect(instructions).toContain('--target user');
    expect(instructions).toContain('**Coding Style:** <coding_style answers');
    expect(instructions).not.toContain('--target memory');
    expect(instructions).not.toContain('### Step 3');
  });

  it('passes question arrays to the Sero CLI without a parameter-object wrapper', () => {
    const instructions = buildBootstrapInstructions(null);
    const commands = instructions.match(/^sero questionnaire .+$/gm) ?? [];

    expect(commands).toHaveLength(2);
    for (const command of commands) {
      const argv = tokenizeCliInput(command);
      expect(argv.slice(0, 2)).toEqual(['sero', 'questionnaire']);
      expect(argv).toHaveLength(3);
      const questions = JSON.parse(argv[2]!) as Array<Record<string, unknown>>;
      expect(questions.length).toBeGreaterThan(0);
      expect(questions.every((question) =>
        typeof question.id === 'string'
        && typeof question.prompt === 'string'
        && Array.isArray(question.options),
      )).toBe(true);
    }
  });
});

describe('bootstrap status', () => {
  let seroHome = '';

  beforeEach(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-bootstrap-'));
    process.env.SERO_HOME = seroHome;
    await mkdir(resolveMemoryRoot(), { recursive: true });
  });

  afterEach(async () => {
    process.env.SERO_HOME = originalSeroHome;
    await rm(seroHome, { recursive: true, force: true });
  });

  it('keeps onboarding active until both profile files exist', async () => {
    expect((await checkBootstrapStatus()).needsBootstrap).toBe(true);

    await writeFile(getIdentityPath(resolveMemoryRoot()), '# Identity\n');
    expect((await checkBootstrapStatus()).needsBootstrap).toBe(true);

    await writeFile(getUserPath(resolveMemoryRoot()), '# User\n');
    expect((await checkBootstrapStatus()).needsBootstrap).toBe(false);
  });

  it('starts onboarding without adding a status message to chat', async () => {
    const session = createSession({ sessionId: 'bootstrap-test', cwd: seroHome });

    await session.start();

    expect(session.sentMessageTypes).toEqual([]);
    expect((await session.prompt('Set up memory')).systemPrompt).toContain('Memory Setup Required');
  });

  it('does not onboard a profile whose old MEMORY.md was converted', async () => {
    const backupPath = `${getMemoryPath(resolveMemoryRoot())}.v2-backup`;
    await writeFile(backupPath, '# Memory\n');
    await mkdir(path.dirname(conversionPaths.state()), { recursive: true });
    await writeFile(conversionPaths.state(), JSON.stringify({ backupPath }));

    expect((await checkBootstrapStatus()).needsBootstrap).toBe(false);
  });
});
