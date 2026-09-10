import type { CreateLoopOptions, Loop, OrchestratorActionResult } from '../shared/types';
import type { OrchestratorHost } from './host';
import { buildDraftLoop } from './loop-factory';
import { runPlanningFlow } from './planning-flow';
import { validateDeliverySettings } from './schema';
import { mergeConcurrentAccounting } from './run-engine-helpers';

/** Persist before the planner runs; a repeated request resumes the same draft. */
export function createLoopPlanner(host: OrchestratorHost, onPlanned: (loop: Loop) => void) {
  const pending = new Map<string, Promise<OrchestratorActionResult>>();
  const plan = async (prompt: string, title?: string, options?: CreateLoopOptions): Promise<OrchestratorActionResult> => {
    if (!prompt.trim()) return { ok: false, error: 'A loop prompt is required.' };
    const errors = options?.delivery ? validateDeliverySettings(options.delivery) : [];
    if (errors.length) return { ok: false, error: errors.join('; ') };
    const requestId = options?.requestId;
    let draft = buildDraftLoop(host, { prompt, title, options });
    await host.updateState((state) => {
      const existing = requestId ? state.loops.find((loop) => loop.creation?.requestId === requestId) : undefined;
      if (existing) { draft = existing; return state; }
      draft = { ...draft, creation: { requestId, attempts: 0, complete: false } };
      return { ...state, loops: [...state.loops, draft] };
    });
    if (draft.prompt !== prompt) return { ok: false, loopId: draft.id, error: 'The creation request already belongs to a different prompt.' };
    if (draft.creation?.complete) return { ok: true, loop: draft, loopId: draft.id };
    // One initial attempt and one restart recovery. The counter survives restarts.
    if ((draft.creation?.attempts ?? 0) >= 2) {
      return { ok: false, loopId: draft.id, error: 'Workflow planning was interrupted twice. Recovery stopped; the saved workflow is preserved.' };
    }
    const creation = { requestId, attempts: (draft.creation?.attempts ?? 0) + 1, complete: false };
    draft = { ...draft, creation };
    await host.updateState((state) => ({ ...state, loops: state.loops.map((loop) => loop.id === draft.id ? draft : loop) }));
    const planned = await runPlanningFlow(host, draft, { prompt, options, title });
    let loop: Loop = { ...planned, creation: { ...creation, complete: true } };
    await host.updateState((state) => ({ ...state, loops: state.loops.map((current) => current.id === loop.id ? mergeConcurrentAccounting(current, loop) : current) }));
    loop = (await host.readState())?.loops.find((current) => current.id === loop.id) ?? loop;
    onPlanned(loop);
    return { ok: true, loop, loopId: loop.id };
  };
  return (prompt: string, title?: string, options?: CreateLoopOptions): Promise<OrchestratorActionResult> => {
    const key = options?.requestId;
    if (!key) return plan(prompt, title, options);
    const running = pending.get(key);
    if (running) return running;
    const operation = plan(prompt, title, options).finally(() => pending.delete(key));
    pending.set(key, operation);
    return operation;
  };
}
