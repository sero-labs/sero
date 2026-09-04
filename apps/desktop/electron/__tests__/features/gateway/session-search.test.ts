import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  buildSnippet,
  searchSessions,
  type SearchableSession,
} from '@electron/ipc/gateway/session-search';

const dir = mkdtempSync(path.join(tmpdir(), 'sero-session-search-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Write a session JSONL and return the searchable record for it. */
function makeSession(
  id: string,
  options: {
    name?: string;
    firstMessage?: string;
    texts?: string[];
    updatedAt?: string;
    workspaceId?: string;
  } = {},
): SearchableSession {
  const filePath = path.join(dir, `${id}.jsonl`);
  const lines = (options.texts ?? []).map((text) =>
    JSON.stringify({ type: 'message', message: { role: 'user', content: text } }),
  );
  writeFileSync(filePath, lines.map((line) => `${line}\n`).join(''), 'utf8');

  return {
    id,
    workspaceId: options.workspaceId ?? 'ws-1',
    name: options.name ?? '',
    firstMessage: options.firstMessage ?? '',
    updatedAt: options.updatedAt ?? '2026-01-01T00:00:00.000Z',
    messageCount: lines.length,
    path: filePath,
  };
}

describe('buildSnippet', () => {
  it('marks both ends when the match sits inside a longer text', () => {
    const text = `${'a'.repeat(200)}needle${'b'.repeat(200)}`;
    const snippet = buildSnippet(text, 200, 'needle'.length);

    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toContain('needle');
  });

  it('marks no ends when the whole text fits', () => {
    expect(buildSnippet('find the needle here', 9, 6)).toBe('find the needle here');
  });

  it('collapses runs of whitespace', () => {
    expect(buildSnippet('a\n\n  needle', 5, 6)).toBe('a needle');
  });
});

describe('searchSessions', () => {
  it('returns nothing for a blank query', async () => {
    const session = makeSession('blank', { name: 'anything' });
    expect(await searchSessions([session], '   ')).toEqual([]);
  });

  it('matches the session name without reading the file', async () => {
    const session = makeSession('by-name', { name: 'Refactor the gateway' });

    const results = await searchSessions([session], 'gateway');

    expect(results).toHaveLength(1);
    expect(results[0]?.sessionId).toBe('by-name');
    expect(results[0]?.snippet).toBe('Refactor the gateway');
    expect(results[0]?.matchCount).toBe(1);
  });

  it('matches ignoring case', async () => {
    const session = makeSession('case', { name: 'Fix the Gateway' });
    expect(await searchSessions([session], 'GATEWAY')).toHaveLength(1);
  });

  it('falls back to the session name when only the first message matches', async () => {
    const session = makeSession('by-first', { firstMessage: 'please fix the parser' });

    const results = await searchSessions([session], 'parser');

    expect(results[0]?.name).toBe('please fix the parser');
  });

  it('matches message text on disk and counts every hit', async () => {
    const session = makeSession('by-body', {
      name: 'Unrelated title',
      texts: ['first mentions cassette', 'second mentions cassette too', 'third does not'],
    });

    const results = await searchSessions([session], 'cassette');

    expect(results).toHaveLength(1);
    expect(results[0]?.matchCount).toBe(2);
    expect(results[0]?.snippet).toBe('first mentions cassette');
  });

  it('skips a session whose file is missing', async () => {
    const session = makeSession('gone', { name: 'nothing' });
    rmSync(session.path);

    expect(await searchSessions([session], 'cassette')).toEqual([]);
  });

  it('orders results newest first', async () => {
    const older = makeSession('older', {
      name: 'match older',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const newer = makeSession('newer', {
      name: 'match newer',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    const results = await searchSessions([older, newer], 'match');

    expect(results.map((result) => result.sessionId)).toEqual(['newer', 'older']);
  });

  it('stops at the requested limit', async () => {
    const sessions = ['a', 'b', 'c'].map((id) => makeSession(`limit-${id}`, { name: 'match' }));

    expect(await searchSessions(sessions, 'match', 2)).toHaveLength(2);
  });

  it('keeps the workspace id of each session', async () => {
    const session = makeSession('scoped', { name: 'match', workspaceId: 'ws-9' });

    expect((await searchSessions([session], 'match'))[0]?.workspaceId).toBe('ws-9');
  });
});
