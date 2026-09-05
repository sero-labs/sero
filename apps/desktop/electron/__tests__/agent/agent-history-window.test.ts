import { describe, expect, it } from 'vitest';

import {
  INITIAL_USER_TURN_LIMIT,
  OLDER_PAGE_USER_TURN_LIMIT,
  readNewestTurns,
  readTurnsBefore,
} from '@electron/ipc/agent/core/agent-history-window';
import { convertSessionMessages } from '@electron/ipc/agent/core/agent-messages';
import type { ChatHistoryPage, ChatMessage } from '@/types/ipc';

interface FakeSession {
  messages: unknown[];
  sessionManager: { getBranch: () => unknown[] };
}

/** One user turn: prompt, a tool call with a chatty result, and a reply. */
function turn(index: number, outputLines = 20): unknown[] {
  const toolCallId = `call-${index}`;
  return [
    { role: 'user', content: `prompt ${index}` },
    {
      role: 'assistant',
      content: [
        { type: 'toolCall', id: toolCallId, name: 'bash', arguments: { command: `echo ${index}` } },
      ],
    },
    {
      role: 'toolResult',
      toolCallId,
      isError: false,
      content: [{ type: 'text', text: Array.from({ length: outputLines }, (_, i) => `line ${i} of turn ${index}`).join('\n') }],
    },
    { role: 'assistant', content: [{ type: 'text', text: `reply ${index}` }] },
  ];
}

function thread(turnCount: number): FakeSession {
  const messages = Array.from({ length: turnCount }, (_, index) => turn(index)).flat();
  return { messages, sessionManager: { getBranch: () => [] } };
}

function userTexts(messages: ChatMessage[]): string[] {
  return messages.filter((message) => message.type === 'user').map((message) => message.text);
}

function asSession(session: FakeSession) {
  return session as never;
}

describe('readNewestTurns', () => {
  it('returns only the newest user turns of a long thread, with a cursor for the rest', () => {
    const page = readNewestTurns(asSession(thread(500)), 'ws-1');

    expect(userTexts(page.messages)).toEqual(
      Array.from({ length: INITIAL_USER_TURN_LIMIT }, (_, i) => `prompt ${500 - INITIAL_USER_TURN_LIMIT + i}`),
    );
    expect(page.olderCursor).not.toBeNull();
    // Every tool call in the window carries its result, so no row shows as running.
    expect(page.messages.filter((m) => m.type === 'tool').every((m) => m.type === 'tool' && m.state === 'completed')).toBe(true);
  });

  it('payload size does not grow with thread length', () => {
    const short = JSON.stringify(readNewestTurns(asSession(thread(12)), 'ws-1')).length;
    const long = JSON.stringify(readNewestTurns(asSession(thread(500)), 'ws-1')).length;
    const full = JSON.stringify(convertSessionMessages(thread(500).messages as never)).length;

    // Same turn count, so the only difference is wider turn numbers in the text.
    expect(long).toBeLessThan(short * 1.1);
    expect(long * 10).toBeLessThan(full);
  });

  it('keeps a thread with fewer turns than the window whole and ends paging', () => {
    const session = thread(3);
    const page = readNewestTurns(asSession(session), 'ws-1');

    expect(userTexts(page.messages)).toEqual(['prompt 0', 'prompt 1', 'prompt 2']);
    expect(page.olderCursor).toBeNull();
  });

  it('puts host messages before the first user turn into the oldest window', () => {
    const session = thread(2);
    session.messages.unshift({ role: 'custom', customType: 'note', content: 'hello' });
    const page = readNewestTurns(asSession(session), 'ws-1');

    expect(page.messages[0]).toMatchObject({ type: 'assistant', text: '[note] hello' });
  });
});

describe('readTurnsBefore', () => {
  it('pages older turns without gaps or duplicates until the thread start', () => {
    const session = asSession(thread(75));
    const pages: ChatHistoryPage[] = [readNewestTurns(session, 'ws-1')];
    while (pages[pages.length - 1].olderCursor) {
      pages.push(readTurnsBefore(session, 'ws-1', pages[pages.length - 1].olderCursor as string));
    }

    expect(pages.map((page) => userTexts(page.messages).length)).toEqual([
      INITIAL_USER_TURN_LIMIT,
      OLDER_PAGE_USER_TURN_LIMIT,
      OLDER_PAGE_USER_TURN_LIMIT,
      OLDER_PAGE_USER_TURN_LIMIT,
      75 - INITIAL_USER_TURN_LIMIT - 3 * OLDER_PAGE_USER_TURN_LIMIT,
    ]);
    const stitched = pages.reverse().flatMap((page) => userTexts(page.messages));
    expect(stitched).toEqual(Array.from({ length: 75 }, (_, i) => `prompt ${i}`));
    expect(pages.every((page) => !page.replaces)).toBe(true);
  });

  it('stays valid while the tail grows during streaming', () => {
    const session = thread(40);
    const first = readNewestTurns(asSession(session), 'ws-1');
    session.messages.push(...turn(40), ...turn(41));

    const older = readTurnsBefore(asSession(session), 'ws-1', first.olderCursor as string);
    expect(older.replaces).toBeUndefined();
    expect(userTexts(older.messages)).toEqual(
      Array.from({ length: OLDER_PAGE_USER_TURN_LIMIT }, (_, i) => `prompt ${10 + i}`),
    );
  });

  it('replaces the window instead of prepending after a compaction rewrote the head', () => {
    const session = thread(40);
    const first = readNewestTurns(asSession(session), 'ws-1');
    // Compaction: earlier turns collapse into one summary message.
    session.messages.splice(0, 30 * 4, { role: 'custom', customType: 'summary', content: 'Summary of 30 turns' });

    const page = readTurnsBefore(asSession(session), 'ws-1', first.olderCursor as string);
    expect(page.replaces).toBe(true);
    expect(userTexts(page.messages)).toEqual(userTexts(readNewestTurns(asSession(session), 'ws-1').messages));
  });

  it('replaces the window after a branch change moved the cursor turn', () => {
    const session = thread(40);
    const first = readNewestTurns(asSession(session), 'ws-1');
    session.messages.splice(20 * 4);
    session.messages.push(...turn(100), ...turn(101));

    const page = readTurnsBefore(asSession(session), 'ws-1', first.olderCursor as string);
    expect(page.replaces).toBe(true);
    expect(page.olderCursor).not.toBeNull();
  });

  it('treats a malformed cursor as stale', () => {
    const page = readTurnsBefore(asSession(thread(5)), 'ws-1', 'not-a-cursor');
    expect(page.replaces).toBe(true);
  });

  it('maps turn-undo refs onto the right user turn inside an older window', () => {
    const session = thread(30);
    const branch: unknown[] = [];
    session.messages.forEach((message, index) => {
      const msg = message as { role: string };
      if (msg.role !== 'user') return;
      const turnIndex = index / 4;
      branch.push({ id: `user-entry-${turnIndex}`, type: 'message', message: { role: 'user', content: '' } });
      branch.push({
        id: `undo-entry-${turnIndex}`,
        type: 'custom',
        customType: 'turn-undo',
        data: {
          workspaceId: 'ws-1',
          snapshotId: `snap-${turnIndex}`,
          targetUserEntryId: `user-entry-${turnIndex}`,
          label: `Undo ${turnIndex}`,
          recordedAt: '2026-04-17T09:00:00.000Z',
        },
      });
    });
    session.sessionManager.getBranch = () => branch;

    const newest = readNewestTurns(asSession(session), 'ws-1');
    const older = readTurnsBefore(asSession(session), 'ws-1', newest.olderCursor as string);
    const users = older.messages.filter((m): m is Extract<ChatMessage, { type: 'user' }> => m.type === 'user');

    expect(users[0]).toMatchObject({ text: 'prompt 0', turnUndo: { snapshotId: 'snap-0' } });
    expect(users[19]).toMatchObject({ text: 'prompt 19', turnUndo: { snapshotId: 'snap-19' } });
  });
});
