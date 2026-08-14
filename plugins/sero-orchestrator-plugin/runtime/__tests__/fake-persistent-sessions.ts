/**
 * In-memory stand-in for the host's `appRuntime.persistentSessions` capability
 * (AD-029). It records what the runtime asked for, so a test can assert that
 * Room code never widened a grant, never named a session path, and never ran a
 * turn without one.
 *
 * `manual` mode holds turns open until the test ends them, which is how
 * concurrency, the Conductor reserve and pause-while-running are exercised
 * without a real model and without a real clock.
 */

import type {
  ExtensionRuntimeContent,
  PersistentSessionEvent,
  PersistentSessionGrantHandle,
  PersistentSessionGrantProposal,
  PersistentSessionHandle,
  PersistentSessionRequest,
  PersistentSessionUsage,
  PersistentSessionsApi,
} from '@sero-ai/common';

/** Cost one completed turn adds to a session's cumulative usage. */
const COST_PER_TURN = 0.25;

export interface FakeSession {
  subject: string;
  sessionId: string;
  sessionPath: string;
  usage: PersistentSessionUsage;
  disposed: boolean;
}

export interface FakePersistentSessions extends PersistentSessionsApi {
  /** `auto` ends every turn on its own; `manual` waits for `endTurn`. */
  mode: 'auto' | 'manual';
  proposals: PersistentSessionGrantProposal[];
  requests: PersistentSessionRequest[];
  prompts: { handleId: string; content: ExtensionRuntimeContent }[];
  revoked: string[];
  aborted: string[];
  compacted: string[];
  /** Handle ids passed to `dispose`, in order. */
  disposed: string[];
  /** Every `readHistory` call. A restart that replays a transcript shows up here. */
  historyReads: { grantId: string; subject: string }[];
  /** Sessions by subject. A disposed session keeps its id and path. */
  sessions: Map<string, FakeSession>;
  /** Open handles. Empty after every session is disposed. */
  liveHandles: Map<string, FakeSession>;
  /** Set to reject the next grant request, as a user decline would. */
  refuseGrant: boolean;
  /** Set to fail the next prompt with this message, as a dead route would. */
  failNextPrompt: string | null;
  /** Ends the turn before `prompt()` resolves, the race a naive watcher loses. */
  endBeforePromptResolves: boolean;
  /** Fraction of the context window reported as used. */
  contextFill: number;
  /** Ends a held turn. Unknown subjects are ignored. */
  endTurn(subject: string, status?: 'completed' | 'aborted' | 'error'): void;
  /** Subjects with a turn currently open. */
  openTurns(): string[];
}

export function createFakePersistentSessions(sessionRoot = '/sessions/rooms'): FakePersistentSessions {
  const listeners = new Map<string, ((event: PersistentSessionEvent) => void)[]>();
  const bySubject = new Map<string, FakeSession>();
  const byHandle = new Map<string, FakeSession>();
  const openTurnIds = new Map<string, string>();
  let grants = 0;
  let handles = 0;
  let turns = 0;

  const emit = (subject: string, event: PersistentSessionEvent): void => {
    for (const listener of listeners.get(subject) ?? []) listener(event);
  };

  const bind = (session: FakeSession): PersistentSessionHandle => {
    handles += 1;
    const handleId = `handle-${handles}`;
    byHandle.set(handleId, session);
    session.disposed = false;
    return { handleId, subject: session.subject, sessionId: session.sessionId, sessionPath: session.sessionPath };
  };

  const api: FakePersistentSessions = {
    mode: 'auto',
    proposals: [],
    requests: [],
    prompts: [],
    revoked: [],
    aborted: [],
    compacted: [],
    disposed: [],
    historyReads: [],
    sessions: bySubject,
    liveHandles: byHandle,
    refuseGrant: false,
    failNextPrompt: null,
    endBeforePromptResolves: false,
    contextFill: 0.1,

    async requestGrant(proposal): Promise<PersistentSessionGrantHandle> {
      api.proposals.push(proposal);
      if (api.refuseGrant) throw new Error('the user declined this Room');
      grants += 1;
      return {
        grantId: `grant-${grants}`,
        subjects: proposal.subjects,
        maxLiveSessions: proposal.maxLiveSessions,
        maxTotalSessions: proposal.maxTotalSessions,
        issuedAt: '2026-01-01T00:00:00.000Z',
      };
    },

    async revokeGrant(grantId) {
      api.revoked.push(grantId);
    },

    async create(request): Promise<PersistentSessionHandle> {
      api.requests.push(request);
      // The host binds a subject to one file exactly once; a second create for
      // the same subject is a denial, not a new session.
      if (bySubject.has(request.subject)) throw new Error(`subject ${request.subject} already has a session`);
      const session: FakeSession = {
        subject: request.subject,
        sessionId: `session-${request.subject}`,
        // The HOST names the file. A request never carries a path.
        sessionPath: `${sessionRoot}/${request.subject}.jsonl`,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, turns: 0 },
        disposed: false,
      };
      bySubject.set(request.subject, session);
      return bind(session);
    },

    async open(request): Promise<PersistentSessionHandle> {
      api.requests.push(request);
      const session = bySubject.get(request.subject);
      if (!session) throw new Error(`subject ${request.subject} has no session to open`);
      return bind(session);
    },

    async prompt(handleId, content) {
      const session = byHandle.get(handleId);
      if (!session) throw new Error(`unknown handle ${handleId}`);
      api.prompts.push({ handleId, content });
      if (api.failNextPrompt) {
        const message = api.failNextPrompt;
        api.failNextPrompt = null;
        throw new Error(message);
      }
      turns += 1;
      const turnId = `turn-${turns}`;
      openTurnIds.set(session.subject, turnId);
      emit(session.subject, { type: 'turn_start', turnId });
      emit(session.subject, { type: 'text', text: `reply ${turnId}` });
      if (api.endBeforePromptResolves) api.endTurn(session.subject);
      // The normal path ends the turn after `prompt` resolves, so the early-end
      // race above is a distinct case rather than the only one covered.
      else if (api.mode === 'auto') queueMicrotask(() => api.endTurn(session.subject));
      return { turnId };
    },

    async steer() {
      // Nothing to do: steering arrives with Phase 5.
    },

    async abort(handleId) {
      const session = byHandle.get(handleId);
      if (!session) return;
      api.aborted.push(session.subject);
      if (openTurnIds.has(session.subject)) api.endTurn(session.subject, 'aborted');
    },

    subscribe(handleId, callback) {
      const session = byHandle.get(handleId);
      if (!session) return () => undefined;
      const subject = session.subject;
      listeners.set(subject, [...(listeners.get(subject) ?? []), callback]);
      return () => {
        listeners.set(subject, (listeners.get(subject) ?? []).filter((entry) => entry !== callback));
      };
    },

    async compact(handleId) {
      const session = byHandle.get(handleId);
      if (session) api.compacted.push(session.subject);
    },

    async getContextUsage() {
      return { usedTokens: Math.round(200_000 * api.contextFill), maxTokens: 200_000 };
    },

    async getSessionUsage(handleId) {
      const session = byHandle.get(handleId);
      if (!session) throw new Error(`unknown handle ${handleId}`);
      return { ...session.usage };
    },

    async dispose(handleId) {
      const session = byHandle.get(handleId);
      // Disposal closes the live session only: the record keeps its id and path.
      if (session) session.disposed = true;
      api.disposed.push(handleId);
      byHandle.delete(handleId);
    },

    async readHistory(grantId, subject) {
      api.historyReads.push({ grantId, subject });
      return { entries: [], olderCursor: null };
    },

    endTurn(subject, status = 'completed') {
      const turnId = openTurnIds.get(subject);
      if (!turnId) return;
      openTurnIds.delete(subject);
      const session = bySubject.get(subject);
      if (session && status === 'completed') {
        // Cumulative, like a real session: a caller must ASSIGN these totals
        // rather than add them, or every turn multiplies the reported spend.
        session.usage = {
          ...session.usage,
          turns: session.usage.turns + 1,
          inputTokens: session.usage.inputTokens + 100,
          outputTokens: session.usage.outputTokens + 50,
          costUsd: Number((session.usage.costUsd + COST_PER_TURN).toFixed(4)),
        };
      }
      emit(subject, { type: 'turn_end', turnId, status });
    },

    openTurns: () => [...openTurnIds.keys()],
  };

  return api;
}
