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
  PersistentSessionExpansion,
  PersistentSessionGrantAmendment,
  PersistentSessionGrantAmendmentResult,
  PersistentSessionGrantHandle,
  PersistentSessionGrantProposal,
  PersistentSessionSubjectPolicy,
  PersistentSessionHandle,
  PersistentSessionRequest,
  PersistentSessionUsage,
  PersistentSessionLiveSnapshot,
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
  deleted: string[];
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
  /** What `liveSnapshot` returns, by subject. Unset means no turn in flight. */
  partials: Map<string, PersistentSessionLiveSnapshot>;
  /** Every `amendGrant` call, in order, including repeats. */
  amendments: PersistentSessionGrantAmendment[];
  /** What the user answers when an amendment asks. */
  askAnswer: 'approve' | 'decline';
  /** The next fresh amendment gets this answer instead of being evaluated. */
  nextAmendment: 'stale' | 'refused' | 'throw' | null;
  /** Set to have the host store a smaller policy than was asked, as its permission profile does. */
  clampSubject: ((policy: PersistentSessionSubjectPolicy) => PersistentSessionSubjectPolicy) | null;
  /** Grants as the host holds them: revision, stored policies, retired subjects. */
  grantState: Map<string, { revision: number; subjects: Record<string, PersistentSessionSubjectPolicy>; retired: string[] }>;
  /** Sessions the host has counted against each grant's total. Retiring never lowers it. */
  consumed: Map<string, number>;
  /** Set to reject the next grant request, as a user decline would. */
  refuseGrant: boolean;
  /** Set to fail the next prompt with this message, as a dead route would. */
  failNextPrompt: string | null;
  /** Set to fail the next session open, as a host that cannot reopen a session does. */
  failNextOpen: string | null;
  /** Set to refuse the next session creation, as an unavailable model does. */
  failNextCreate: string | null;
  /** Ends the turn before `prompt()` resolves, the race a naive watcher loses. */
  endBeforePromptResolves: boolean;
  /** Fraction of the context window reported as used. */
  contextFill: number;
  /** Ends a held turn. Unknown subjects are ignored. */
  endTurn(subject: string, status?: 'completed' | 'aborted' | 'error'): void;
  /** Subjects with a turn currently open. */
  openTurns(): string[];
  emit(subject: string, event: PersistentSessionEvent): void;
}

export function createFakePersistentSessions(sessionRoot = '/sessions/rooms'): FakePersistentSessions {
  const listeners = new Map<string, ((event: PersistentSessionEvent) => void)[]>();
  const bySubject = new Map<string, FakeSession>();
  const byHandle = new Map<string, FakeSession>();
  const openTurnIds = new Map<string, string>();
  const stored = new Map<string, PersistentSessionGrantAmendmentResult>();
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
    deleted: [],
    aborted: [],
    compacted: [],
    disposed: [],
    historyReads: [],
    sessions: bySubject,
    liveHandles: byHandle,
    amendments: [],
    askAnswer: 'approve',
    nextAmendment: null,
    clampSubject: null,
    grantState: new Map(),
    consumed: new Map(),
    refuseGrant: false,
    failNextPrompt: null,
    failNextCreate: null,
    failNextOpen: null,
    endBeforePromptResolves: false,
    contextFill: 0.1,

    async requestGrant(proposal): Promise<PersistentSessionGrantHandle> {
      api.proposals.push(proposal);
      if (api.refuseGrant) throw new Error('the user declined this Room');
      grants += 1;
      api.grantState.set(`grant-${grants}`, { revision: 0, subjects: { ...proposal.subjects }, retired: [] });
      return {
        grantId: `grant-${grants}`,
        subjects: proposal.subjects,
        maxLiveSessions: proposal.maxLiveSessions,
        maxTotalSessions: proposal.maxTotalSessions,
        issuedAt: '2026-01-01T00:00:00.000Z',
        revision: 0,
      };
    },

    async amendGrant(amendment): Promise<PersistentSessionGrantAmendmentResult> {
      api.amendments.push(amendment);
      const grant = api.grantState.get(amendment.grantId);
      const earlier = stored.get(amendment.amendmentId);
      // A repeat returns the stored answer. A hold is the one answer that is not
      // final: the user may still say yes to it.
      if (earlier && earlier.status !== 'needs-approval') return earlier;
      if (!grant) return { status: 'refused', amendmentId: amendment.amendmentId, revision: null, reason: 'unknown grant' };
      const finish = (result: PersistentSessionGrantAmendmentResult): PersistentSessionGrantAmendmentResult => {
        stored.set(amendment.amendmentId, result);
        return result;
      };
      if (api.nextAmendment === 'throw') {
        api.nextAmendment = null;
        throw new Error('the host did not answer');
      }
      if (api.nextAmendment) {
        const status = api.nextAmendment;
        api.nextAmendment = null;
        return finish(status === 'stale'
          ? { status, amendmentId: amendment.amendmentId, revision: grant.revision }
          : { status, amendmentId: amendment.amendmentId, revision: grant.revision, reason: 'the host refused this change' });
      }
      if (amendment.expectedRevision !== grant.revision) {
        return finish({ status: 'stale', amendmentId: amendment.amendmentId, revision: grant.revision });
      }
      const expansion: PersistentSessionExpansion[] = [];
      for (const [subject, policy] of Object.entries(amendment.subjects ?? {})) {
        const before = grant.subjects[subject];
        if (!before) {
          expansion.push({ subject, field: 'subject', value: subject });
          continue;
        }
        const added = (field: PersistentSessionExpansion['field'], next: string[], prior: string[]): void => {
          for (const value of next.filter((entry) => !prior.includes(entry))) expansion.push({ subject, field, value });
        };
        added('model', policy.allowedModels, before.allowedModels);
        added('thinking', policy.allowedThinkingLevels ?? [], before.allowedThinkingLevels ?? []);
        added('tool', policy.allowedTools, before.allowedTools);
        added('skill', policy.allowedSkills, before.allowedSkills);
      }
      let approvedByUser = false;
      if (expansion.length > 0) {
        if ((amendment.approval ?? 'hold') === 'hold') {
          return finish({ status: 'needs-approval', amendmentId: amendment.amendmentId, revision: grant.revision, expansion });
        }
        if (api.askAnswer === 'decline') {
          return finish({ status: 'declined', amendmentId: amendment.amendmentId, revision: grant.revision });
        }
        approvedByUser = true;
      }
      grant.revision += 1;
      for (const [subject, policy] of Object.entries(amendment.subjects ?? {})) {
        if (!grant.subjects[subject]) api.consumed.set(amendment.grantId, (api.consumed.get(amendment.grantId) ?? 0) + 1);
        grant.subjects[subject] = api.clampSubject ? api.clampSubject(policy) : policy;
      }
      grant.retired.push(...(amendment.retire ?? []));
      return finish({
        status: 'applied',
        amendmentId: amendment.amendmentId,
        revision: grant.revision,
        subjects: { ...grant.subjects },
        retired: [...grant.retired],
        approvedByUser,
      });
    },

    async revokeGrant(grantId) {
      api.revoked.push(grantId);
    },

    async deleteGrant(grantId) {
      await api.revokeGrant(grantId);
      api.deleted.push(grantId);
    },

    async revokeDelegationPolicy() {},

    async create(request): Promise<PersistentSessionHandle> {
      api.requests.push(request);
      if (api.failNextCreate) {
        const message = api.failNextCreate;
        api.failNextCreate = null;
        throw new Error(message);
      }
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
      if (api.failNextOpen) {
        const message = api.failNextOpen;
        api.failNextOpen = null;
        throw new Error(message);
      }
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
      emit(session.subject, { type: 'turn_start', turnId, at: new Date().toISOString() });
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

    partials: new Map(),
    liveSnapshot(handleId) {
      const session = byHandle.get(handleId);
      return session ? api.partials.get(session.subject) ?? null : null;
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
      emit(subject, { type: 'turn_end', turnId, status, at: new Date().toISOString() });
    },

    openTurns: () => [...openTurnIds.keys()],
    emit,
  };

  return api;
}
