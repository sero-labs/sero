/**
 * Windowed reads over a live session's messages, anchored on user turns.
 *
 * The Pi SDK holds the whole branch in memory once a session is open, so the
 * cost this bounds is what crosses IPC and what the renderer keeps: a window
 * of the newest turns first, older windows only when the user scrolls back.
 */

import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { ChatHistoryPage } from '@/types/ipc';
import { buildTurnUndoMapByTurn, convertSessionMessages } from './agent-messages';

/** User turns in the window returned by `agent.open()`. */
export const INITIAL_USER_TURN_LIMIT = 10;
/** User turns in each window returned by `agent.loadOlderTurns()`. */
export const OLDER_PAGE_USER_TURN_LIMIT = 20;

interface HistoryCursor {
  /** Index of the first user turn in the window the cursor came from. */
  turn: number;
  /** Index into `session.messages` where that turn starts. */
  messageIndex: number;
}

/**
 * The cursor pairs a turn index with the message index it started at. A head
 * rewrite (compaction, branch change) moves that turn to another index, which
 * is how a stale cursor is detected without re-sending content.
 */
function encodeCursor(cursor: HistoryCursor): string {
  return `${cursor.turn}@${cursor.messageIndex}`;
}

function decodeCursor(raw: string): HistoryCursor | null {
  const match = /^(\d+)@(\d+)$/.exec(raw);
  if (!match) return null;
  return { turn: Number(match[1]), messageIndex: Number(match[2]) };
}

/** Index into `messages` of each user message, oldest first. */
function userTurnStarts(messages: AgentSession['messages']): number[] {
  const starts: number[] = [];
  messages.forEach((message, index) => {
    if (message.role === 'user') starts.push(index);
  });
  return starts;
}

function windowBefore(
  session: AgentSession,
  workspaceId: string | undefined,
  endTurn: number,
  limit: number,
): ChatHistoryPage {
  const messages = session.messages;
  const starts = userTurnStarts(messages);
  const startTurn = Math.max(0, endTurn - limit);
  const startIndex = startTurn < starts.length ? starts[startTurn] : messages.length;
  const endIndex = endTurn < starts.length ? starts[endTurn] : messages.length;
  // Leading host messages before the first user turn belong to the oldest window.
  const from = startTurn === 0 ? 0 : startIndex;

  const converted = convertSessionMessages(
    messages.slice(from, endIndex),
    buildTurnUndoMapByTurn(session, workspaceId),
    startTurn,
  );
  return {
    messages: converted,
    olderCursor: startTurn > 0
      ? encodeCursor({ turn: startTurn, messageIndex: startIndex })
      : null,
  };
}

/** The newest window of user turns, for `agent.open()` and `messages_loaded`. */
export function readNewestTurns(
  session: AgentSession,
  workspaceId?: string,
  limit = INITIAL_USER_TURN_LIMIT,
): ChatHistoryPage {
  const turnCount = userTurnStarts(session.messages).length;
  return windowBefore(session, workspaceId, turnCount, limit);
}

/**
 * The window of user turns before `cursor`. A cursor that no longer matches
 * the thread yields the newest window with `replaces: true`, so the renderer
 * never prepends turns that were rewritten under it.
 */
export function readTurnsBefore(
  session: AgentSession,
  workspaceId: string | undefined,
  cursor: string,
  limit = OLDER_PAGE_USER_TURN_LIMIT,
): ChatHistoryPage {
  const decoded = decodeCursor(cursor);
  const starts = userTurnStarts(session.messages);
  const valid = decoded !== null
    && decoded.turn > 0
    && starts[decoded.turn] === decoded.messageIndex;
  if (!decoded || !valid) {
    return { ...readNewestTurns(session, workspaceId), replaces: true };
  }
  return windowBefore(session, workspaceId, decoded.turn, limit);
}
