import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { listSessionMetadata } from '@electron/ipc/agent/core/session-metadata';

const tempDirs: string[] = [];

async function createTempSessionDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sero-session-metadata-'));
  tempDirs.push(dir);
  return dir;
}

async function writeJsonl(filePath: string, entries: object[]): Promise<void> {
  await writeFile(filePath, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n', 'utf8');
}

describe('session metadata listing', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('lists sessions from every cwd in the session directory', async () => {
    const sessionDir = await createTempSessionDir();
    await writeJsonl(path.join(sessionDir, 'one.jsonl'), [
      {
        type: 'session',
        version: 3,
        id: 'session-one',
        timestamp: '2026-05-30T10:00:00.000Z',
        cwd: '/workspace/one',
      },
      { type: 'session_info', id: 'info-one', parentId: null, timestamp: '2026-05-30T10:00:01.000Z', name: 'One' },
      {
        type: 'message',
        id: 'message-one',
        parentId: 'info-one',
        timestamp: '2026-05-30T10:00:02.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'first prompt' }] },
      },
    ]);
    await writeJsonl(path.join(sessionDir, 'two.jsonl'), [
      {
        type: 'session',
        version: 3,
        id: 'session-two',
        timestamp: '2026-05-30T11:00:00.000Z',
        cwd: '/workspace/two',
      },
    ]);

    const sessions = await listSessionMetadata(sessionDir);

    expect(sessions.map((session) => session.id).sort()).toEqual(['session-one', 'session-two']);
    expect(sessions.find((session) => session.id === 'session-one')).toMatchObject({
      cwd: '/workspace/one',
      name: 'One',
      firstMessage: 'first prompt',
      messageCount: 1,
    });
    expect(sessions.find((session) => session.id === 'session-two')).toMatchObject({
      cwd: '/workspace/two',
      firstMessage: '',
      messageCount: 0,
    });
  });
});
