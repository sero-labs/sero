/**
 * The typed Room creation handle another plugin's runtime reaches through the
 * `@sero-ai/common` Room registry (spec orchestrator-dispatch-handle).
 *
 * It is `prepare` then `start` on the user's own Room surface, nothing else:
 * the planner, the clamps and the per-grant user approval all happen on the
 * same path the Room panel and the `rooms` tool use. A caller that cannot use
 * session tools gets an id back, or the reason there is none.
 */

import type { OrchestratorRoomCreateRequest, OrchestratorRoomCreateResult, OrchestratorRoomHandle } from '@sero-ai/common';
import type { RoomAppActions } from './room-app-actions';

/** A pending Room create, keyed by requestId, alongside what it was asked for. */
interface PendingRoomCreate {
  promise: Promise<OrchestratorRoomCreateResult>;
  fingerprint: { mandate: string; projectId?: string; runId?: string };
}

export function createRoomDispatchHandle(app: Pick<RoomAppActions, 'prepare' | 'start' | 'inspect'>): OrchestratorRoomHandle {
  const pending = new Map<string, PendingRoomCreate>();
  const create = async (request: OrchestratorRoomCreateRequest): Promise<OrchestratorRoomCreateResult> => {
      const planned = await app.prepare({ problem: request.mandate, limits: request.limits, requestId: request.requestId, project: request.project });
      if (!planned.ok) {
        if (planned.needsInput) {
          const questions = planned.questions.map((question) => question.prompt);
          return { ok: false, error: `The Room planner needs an answer before it can plan: ${questions.join(' ')}`, questions, usage: planned.usage };
        }
        return { ok: false, error: planned.error, usage: planned.usage };
      }
      if (planned.status && !['draft', 'ready', 'adjusting'].includes(planned.status)) return { ok: true, roomId: planned.roomId, usage: planned.usage };
      const started = await app.start(planned.roomId);
      if (!started.ok) {
        return { ok: false, error: `Room ${planned.roomId} was planned but did not start: ${started.error}`, usage: planned.usage };
      }
      return { ok: true, roomId: planned.roomId, usage: planned.usage };
  };
  return {
    inspect: (roomId) => app.inspect(roomId),
    create(request) {
      if (!request.requestId) return create(request);
      const key = request.requestId;
      const fingerprint = { mandate: request.mandate, projectId: request.project?.projectId, runId: request.project?.runId };
      const existing = pending.get(key);
      if (existing) {
        // A concurrent reuse of the same requestId only coalesces when it asks
        // for the same thing — otherwise a second, unrelated caller would get
        // the first caller's Room back.
        if (existing.fingerprint.mandate !== fingerprint.mandate) {
          return Promise.resolve({ ok: false, error: 'This creation request belongs to a different Room mandate.' });
        }
        if (existing.fingerprint.projectId !== fingerprint.projectId || existing.fingerprint.runId !== fingerprint.runId) {
          return Promise.resolve({ ok: false, error: 'This creation request belongs to a different project.' });
        }
        return existing.promise;
      }
      const operation = create(request).finally(() => pending.delete(key));
      pending.set(key, { promise: operation, fingerprint });
      return operation;
    },
  };
}
