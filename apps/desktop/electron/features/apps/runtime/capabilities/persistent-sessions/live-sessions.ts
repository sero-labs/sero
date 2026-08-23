/**
 * The live `AgentSession` registry behind the persistent-session capability.
 *
 * Holds the sessions that are currently open, maps Pi's event stream onto the
 * capability's small `PersistentSessionEvent` union, and guarantees that a
 * handle can always be resolved back to the grant that authorised it — so every
 * operation can re-check revocation.
 *
 * The streamed output is TRANSIENT (NFR-016). Nothing here is persisted: the
 * session file is Pi's, and product state stores only references to it.
 */

import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { PersistentSessionEvent } from '@sero-ai/common';

export interface LiveSession {
  handleId: string;
  grantId: string;
  subject: string;
  sessionId: string;
  sessionPath: string;
  session: AgentSession;
  /**
   * The turn this session is running, or null between turns. Pi's own events
   * carry no turn identity — `agent_start` has no fields and `agent_end` only
   * the messages — so the id a caller is given by `prompt()` is the id this
   * registry stamps on the events of that run. Without it a watcher waits for a
   * turn boundary that can never arrive.
   */
  currentTurnId: string | null;
  /** Set by `abort`, so the turn that ends next is reported as cancelled. */
  aborting: boolean;
  /** Turns completed since this session was opened. Pi counts messages, not turns. */
  turnsTaken: number;
  /** Detaches the Pi listener when the session is disposed. */
  detach(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Longest a tool's arguments may be shown as. Enough to read, short enough to sit on one line. */
const SUMMARY_LIMIT = 120;

/**
 * One line describing what a tool was called with — the command, the path, the
 * pattern. Taken as the first string argument rather than per tool: a fixed
 * list of tool names would go stale the moment a tool is added, and this is a
 * transient label, not a record.
 */
function argSummary(args: unknown): string {
  if (!isRecord(args)) return '';
  const first = Object.values(args).find((value): value is string => typeof value === 'string' && value.length > 0);
  if (!first) return '';
  const line = first.split('\n')[0].trim();
  return line.length > SUMMARY_LIMIT ? `${line.slice(0, SUMMARY_LIMIT - 1)}…` : line;
}

/**
 * Maps a Pi session event to the capability's event, or null for the many Pi
 * events a watcher does not need. Keeping this union small is deliberate: it is
 * the contract a renderer eventually sees, and every field widens what a plugin
 * can observe about another product's session.
 */
export function toPersistentSessionEvent(
  event: unknown,
  turn: { id: string | null; aborting: boolean },
): PersistentSessionEvent | null {
  if (!isRecord(event) || typeof event.type !== 'string') return null;

  switch (event.type) {
    case 'agent_start':
      return { type: 'turn_start', turnId: turn.id ?? '' };
    // Pi streams the answer as deltas on the message being written. The
    // thinking deltas are deliberately not forwarded: a watcher wants to know
    // what the session is doing, and reasoning is neither its answer nor its act.
    case 'message_update': {
      const delta = isRecord(event.assistantMessageEvent) ? event.assistantMessageEvent : null;
      if (!delta || delta.type !== 'text_delta' || typeof delta.delta !== 'string' || delta.delta.length === 0) {
        return null;
      }
      return { type: 'text', text: delta.delta };
    }
    case 'tool_execution_start':
      return { type: 'tool_start', toolName: String(event.toolName ?? 'tool'), summary: argSummary(event.args) };
    case 'tool_execution_end':
      return { type: 'tool_end', toolName: String(event.toolName ?? 'tool'), ok: event.isError !== true };
    case 'agent_end':
      // Pi retries inside one run: it emits `agent_end` for the attempt and
      // starts again. The turn is only over when it will not retry.
      return event.willRetry === true
        ? null
        : { type: 'turn_end', turnId: turn.id ?? '', status: turn.aborting ? 'aborted' : 'completed' };
    case 'compaction_end':
      return event.aborted === true ? null : { type: 'compacted' };
    default:
      return null;
  }
}

export class LiveSessionRegistry {
  private readonly byHandle = new Map<string, LiveSession>();
  /** One subject can have at most one live session, so this is a 1:1 index. */
  private readonly handleBySubject = new Map<string, string>();
  private readonly watchers = new Map<string, Set<(event: PersistentSessionEvent) => void>>();

  private static subjectKey(grantId: string, subject: string): string {
    return `${grantId}::${subject}`;
  }

  add(entry: Omit<LiveSession, 'detach' | 'currentTurnId' | 'aborting' | 'turnsTaken'>): LiveSession {
    const detach = entry.session.subscribe((event) => {
      const mapped = toPersistentSessionEvent(event, { id: live.currentTurnId, aborting: live.aborting });
      if (!mapped) return;
      // The turn is over: the next one gets its own id, and a cancellation
      // applies to the turn it cancelled, not to the one after it.
      if (mapped.type === 'turn_end') {
        if (live.currentTurnId) live.turnsTaken += 1;
        live.currentTurnId = null;
        live.aborting = false;
      }
      // A throwing watcher must not break the session or the other watchers.
      for (const watcher of this.watchers.get(entry.handleId) ?? []) {
        try {
          watcher(mapped);
        } catch {
          // Observation is read-only; a bad observer is its own problem.
        }
      }
    });

    const live: LiveSession = { ...entry, currentTurnId: null, aborting: false, turnsTaken: 0, detach };
    this.byHandle.set(entry.handleId, live);
    this.handleBySubject.set(LiveSessionRegistry.subjectKey(entry.grantId, entry.subject), entry.handleId);
    return live;
  }

  get(handleId: string): LiveSession | null {
    return this.byHandle.get(handleId) ?? null;
  }

  forSubject(grantId: string, subject: string): LiveSession | null {
    const handleId = this.handleBySubject.get(LiveSessionRegistry.subjectKey(grantId, subject));
    return handleId ? this.get(handleId) : null;
  }

  forGrant(grantId: string): LiveSession[] {
    return [...this.byHandle.values()].filter((entry) => entry.grantId === grantId);
  }

  /** Returns the removed entry so the caller can dispose the Pi session itself. */
  remove(handleId: string): LiveSession | null {
    const entry = this.byHandle.get(handleId);
    if (!entry) return null;
    entry.detach();
    this.byHandle.delete(handleId);
    this.handleBySubject.delete(LiveSessionRegistry.subjectKey(entry.grantId, entry.subject));
    this.watchers.delete(handleId);
    return entry;
  }

  /** Names the turn a session is about to run, so its events can be matched to it. */
  beginTurn(handleId: string, turnId: string): void {
    const entry = this.byHandle.get(handleId);
    if (!entry) return;
    entry.currentTurnId = turnId;
    entry.aborting = false;
  }

  /** Records that the running turn was cancelled rather than finished. */
  markAborting(handleId: string): void {
    const entry = this.byHandle.get(handleId);
    if (entry) entry.aborting = true;
  }

  watch(handleId: string, cb: (event: PersistentSessionEvent) => void): () => void {
    const watchers = this.watchers.get(handleId) ?? new Set<(event: PersistentSessionEvent) => void>();
    watchers.add(cb);
    this.watchers.set(handleId, watchers);
    return () => {
      this.watchers.get(handleId)?.delete(cb);
    };
  }
}
