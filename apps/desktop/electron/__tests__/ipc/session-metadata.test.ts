import { mkdtemp, rm, utimes, writeFile } from 'fs/promises';
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

  it('sorts sessions by modified time newest first', async () => {
    const sessionDir = await createTempSessionDir();
    const oldPath = path.join(sessionDir, 'old.jsonl');
    const newPath = path.join(sessionDir, 'new.jsonl');
    await writeJsonl(oldPath, [{ type: 'session', id: 'old', timestamp: '2026-05-30T10:00:00.000Z', cwd: '/old' }]);
    await writeJsonl(newPath, [{ type: 'session', id: 'new', timestamp: '2026-05-30T11:00:00.000Z', cwd: '/new' }]);
    await utimes(oldPath, new Date('2026-05-30T10:00:00.000Z'), new Date('2026-05-30T10:00:00.000Z'));
    await utimes(newPath, new Date('2026-05-30T12:00:00.000Z'), new Date('2026-05-30T12:00:00.000Z'));

    const sessions = await listSessionMetadata(sessionDir);

    expect(sessions.map((session) => session.id)).toEqual(['new', 'old']);
  });

  it('counts all message entries, including messages outside the active branch', async () => {
    const sessionDir = await createTempSessionDir();
    await writeJsonl(path.join(sessionDir, 'branched.jsonl'), [
      { type: 'session', version: 3, id: 'branched', timestamp: '2026-05-30T10:00:00.000Z', cwd: '/workspace' },
      {
        type: 'message',
        id: 'root-message',
        parentId: null,
        timestamp: '2026-05-30T10:00:01.000Z',
        message: { role: 'user', content: 'start' },
      },
      {
        type: 'message',
        id: 'abandoned-branch',
        parentId: 'root-message',
        timestamp: '2026-05-30T10:00:02.000Z',
        message: { role: 'assistant', content: 'old branch' },
      },
      {
        type: 'message',
        id: 'active-branch',
        parentId: 'root-message',
        timestamp: '2026-05-30T10:00:03.000Z',
        message: { role: 'assistant', content: 'new branch' },
      },
    ]);

    const sessions = await listSessionMetadata(sessionDir);

    expect(sessions[0]?.messageCount).toBe(3);
  });
});
