import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectSessionFiles, parseSessionFile } from '../scan';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'usage-scan-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function line(entry: unknown): string {
  return JSON.stringify(entry);
}

const SESSION_HEADER = line({ type: 'session', id: 'sess-1', cwd: '/workspaces/demo', timestamp: '2026-07-08T09:00:00.000Z' });

function assistantMessage(overrides: Record<string, unknown> = {}): string {
  return line({
    type: 'message',
    timestamp: '2026-07-08T09:01:00.000Z',
    message: {
      role: 'assistant',
      provider: 'anthropic',
      model: 'claude-opus-4-5',
      timestamp: new Date('2026-07-08T09:01:00.000Z').getTime(),
      usage: { input: 10, output: 5, cacheRead: 100, cacheWrite: 20, cost: { total: 0.5 } },
      ...overrides,
    },
  });
}

describe('collectSessionFiles', () => {
  it('finds .jsonl files recursively, sorted, skipping other files', async () => {
    await mkdir(path.join(dir, 'nested/deep'), { recursive: true });
    await writeFile(path.join(dir, 'b.jsonl'), '');
    await writeFile(path.join(dir, 'nested/deep/a.jsonl'), '');
    await writeFile(path.join(dir, 'ignore.txt'), '');

    const files = await collectSessionFiles(dir);
    expect(files).toEqual([path.join(dir, 'b.jsonl'), path.join(dir, 'nested/deep/a.jsonl')].sort());
  });

  it('returns empty for a missing root instead of throwing', async () => {
    expect(await collectSessionFiles(path.join(dir, 'does-not-exist'))).toEqual([]);
  });
});

describe('parseSessionFile', () => {
  it('extracts header, name, first user message, and usage messages', async () => {
    const filePath = path.join(dir, 's.jsonl');
    await writeFile(
      filePath,
      [
        SESSION_HEADER,
        line({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: '  fix the   bug  ' }] } }),
        line({ type: 'session_info', name: 'My session' }),
        assistantMessage(),
        'this is not json {{{',
        line({ type: 'message', message: { role: 'assistant', provider: 'openai', model: 'gpt-6' } }), // no usage
      ].join('\n'),
    );

    const parsed = await parseSessionFile(filePath);
    expect(parsed).not.toBeNull();
    expect(parsed!.sessionId).toBe('sess-1');
    expect(parsed!.cwd).toBe('/workspaces/demo');
    expect(parsed!.name).toBe('My session');
    expect(parsed!.firstMessage).toBe('fix the bug');
    expect(parsed!.messages).toHaveLength(1);
    expect(parsed!.messages[0]).toMatchObject({
      provider: 'anthropic',
      model: 'claude-opus-4-5',
      cost: 0.5,
      input: 10,
      output: 5,
      cacheRead: 100,
      cacheWrite: 20,
    });
  });

  it('falls back to the entry timestamp when the message has none', async () => {
    const filePath = path.join(dir, 's.jsonl');
    await writeFile(filePath, [SESSION_HEADER, assistantMessage({ timestamp: undefined })].join('\n'));
    const parsed = await parseSessionFile(filePath);
    expect(parsed!.messages[0]!.timestamp).toBe(new Date('2026-07-08T09:01:00.000Z').getTime());
  });

  it('returns null for files with no session header', async () => {
    const filePath = path.join(dir, 'headerless.jsonl');
    await writeFile(filePath, assistantMessage());
    expect(await parseSessionFile(filePath)).toBeNull();
  });

  it('returns null for unreadable files', async () => {
    expect(await parseSessionFile(path.join(dir, 'missing.jsonl'))).toBeNull();
  });
});
