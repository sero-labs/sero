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
  /** Detaches the Pi listener when the session is disposed. */
  detach(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Maps a Pi session event to the capability's event, or null for the many Pi
 * events a watcher does not need. Keeping this union small is deliberate: it is
 * the contract a renderer eventually sees, and every field widens what a plugin
 * can observe about another product's session.
 */
export function toPersistentSessionEvent(event: unknown): PersistentSessionEvent | null {
  if (!isRecord(event) || typeof event.type !== 'string') return null;

  switch (event.type) {
    case 'agent_start':
      return { type: 'turn_start', turnId: String(event.turnId ?? '') };
    case 'text':
    case 'text_delta':
      return typeof event.text === 'string' && event.text.length > 0
        ? { type: 'text', text: event.text }
        : null;
    case 'tool_start':
      return {
        type: 'tool_start',
        toolName: String(event.toolName ?? event.name ?? 'tool'),
        summary: typeof event.summary === 'string' ? event.summary : '',
      };
    case 'tool_end':
      return {
        type: 'tool_end',
        toolName: String(event.toolName ?? event.name ?? 'tool'),
        ok: event.isError !== true,
      };
    case 'agent_end':
      return {
        type: 'turn_end',
        turnId: String(event.turnId ?? ''),
        status: event.aborted === true ? 'aborted' : 'completed',
      };
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

  add(entry: Omit<LiveSession, 'detach'>): LiveSession {
    const detach = entry.session.subscribe((event) => {
      const mapped = toPersistentSessionEvent(event);
      if (!mapped) return;
      // A throwing watcher must not break the session or the other watchers.
      for (const watcher of this.watchers.get(entry.handleId) ?? []) {
        try {
          watcher(mapped);
        } catch {
          // Observation is read-only; a bad observer is its own problem.
        }
      }
    });

    const live: LiveSession = { ...entry, detach };
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

  watch(handleId: string, cb: (event: PersistentSessionEvent) => void): () => void {
    const watchers = this.watchers.get(handleId) ?? new Set<(event: PersistentSessionEvent) => void>();
    watchers.add(cb);
    this.watchers.set(handleId, watchers);
    return () => {
      this.watchers.get(handleId)?.delete(cb);
    };
  }
}
