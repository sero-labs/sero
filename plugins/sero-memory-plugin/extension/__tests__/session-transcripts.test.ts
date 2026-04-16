import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  exportTranscriptForSession,
  type SessionTranscriptExportResult,
} from '../session-transcripts';
import { getSessionTranscriptPath } from '../memory-manager';

type ExportSessionManager = Parameters<typeof exportTranscriptForSession>[0];

function createSessionManager(): ExportSessionManager {
  const branch = [
    {
      type: 'message',
      message: {
        role: 'user',
        timestamp: Date.UTC(2026, 3, 14, 8, 30),
        content: [{ type: 'text', text: 'Summarize the launch checklist.' }],
      },
    },
    {
      type: 'message',
      message: {
        role: 'assistant',
        timestamp: Date.UTC(2026, 3, 14, 8, 31),
        content: [{ type: 'text', text: 'Reviewing the checklist now.' }],
      },
    },
    {
      type: 'message',
      message: {
        role: 'bashExecution',
        timestamp: Date.UTC(2026, 3, 14, 8, 32),
        command: 'pnpm typecheck',
        output: 'All projects passed.',
        exitCode: 0,
      },
    },
  ] as ReturnType<ExportSessionManager['getBranch']>;

  return {
    getBranch: () => branch,
    getSessionId: () => 'session-12345678abcdef',
    getHeader: () => ({ timestamp: '2026-04-14T08:30:00.000Z' }),
  } as ExportSessionManager;
}

function expectChanged(result: SessionTranscriptExportResult): string {
  expect(result.changed).toBe(true);
  expect(result.path).toBeDefined();
  return result.path!;
}

describe('session transcript export', () => {
  const originalEnv = {
    SERO_HOME: process.env.SERO_HOME,
    PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
  };

  let seroHome = '';
  let root = '';

  beforeEach(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-transcripts-'));
    root = path.join(seroHome, 'workspaces', 'global');
    process.env.SERO_HOME = seroHome;
    delete process.env.PI_CODING_AGENT_DIR;
  });

  afterEach(async () => {
    process.env.SERO_HOME = originalEnv.SERO_HOME;
    process.env.PI_CODING_AGENT_DIR = originalEnv.PI_CODING_AGENT_DIR;
    await rm(seroHome, { recursive: true, force: true });
  });

  it('writes stable markdown exports and skips unchanged sessions on repeat export', async () => {
    const sessionManager = createSessionManager();

    const firstResult = await exportTranscriptForSession(sessionManager, 'session_start');
    const transcriptPath = expectChanged(firstResult);
    expect(transcriptPath).toBe(
      getSessionTranscriptPath(root, '2026-04-14', 'session-12345678abcdef'),
    );

    const transcript = await readFile(transcriptPath, 'utf8');
    expect(transcript).toContain('# Session 2026-04-14 (session-)');
    expect(transcript).toMatch(/## User \(\d{2}:\d{2}\)/);
    expect(transcript).toContain('Summarize the launch checklist.');
    expect(transcript).toMatch(/## Assistant \(\d{2}:\d{2}\)/);
    expect(transcript).toContain('Reviewing the checklist now.');
    expect(transcript).toMatch(/## Bash \(\d{2}:\d{2}\)/);
    expect(transcript).toContain('**Command:** `pnpm typecheck`');
    expect(transcript).toContain('**Status:** exit 0');

    const secondResult = await exportTranscriptForSession(sessionManager, 'agent_end');
    expect(secondResult).toEqual({
      changed: false,
      path: transcriptPath,
      reason: 'unchanged',
    });

    await expect(readFile(transcriptPath, 'utf8')).resolves.toBe(transcript);
  });
});
