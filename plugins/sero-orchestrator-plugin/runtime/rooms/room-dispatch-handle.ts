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

export function createRoomDispatchHandle(app: Pick<RoomAppActions, 'prepare' | 'start'>): OrchestratorRoomHandle {
  return {
    async create(request: OrchestratorRoomCreateRequest): Promise<OrchestratorRoomCreateResult> {
      const planned = await app.prepare({ problem: request.mandate, limits: request.limits });
      if (!planned.ok) {
        if (planned.needsInput) {
          const asked = planned.questions.map((question) => question.prompt).join(' ');
          return { ok: false, error: `The Room planner needs an answer before it can plan: ${asked}` };
        }
        return { ok: false, error: planned.error };
      }
      const started = await app.start(planned.roomId);
      if (!started.ok) {
        return { ok: false, error: `Room ${planned.roomId} was planned but did not start: ${started.error}` };
      }
      return { ok: true, roomId: planned.roomId };
    },
  };
}
