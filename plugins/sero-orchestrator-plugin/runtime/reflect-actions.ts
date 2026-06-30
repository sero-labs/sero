/**
 * Coordinator-facing handlers for the reflection actions (specs/06-reflection.md).
 * Kept out of coordinator.ts (500-LOC limit); the coordinator delegates the three
 * reflection action kinds here.
 *
 *   reflect            — reflect on one loop, queue its pending suggestions
 *   reflect_workspace  — reflect on every loop with run history, CONSECUTIVELY
 *   choose_suggestion  — approve (apply via revise) or reject (record + reason)
 *
 * Each loop learns only from its OWN history; reflect_workspace is a batch
 * trigger, not a shared learnings store.
 */

import type { Loop, OrchestratorAction, OrchestratorActionResult, ReflectedLoopSummary } from '../shared/types';
import type { OrchestratorHost } from './host';
import { gatherHistory } from './digest';
import { applyReflection, approveSuggestion, proposeImprovements, rejectSuggestion } from './reflection';

type ReflectAction = Extract<OrchestratorAction, { kind: 'reflect' | 'reflect_workspace' | 'choose_suggestion' }>;

async function findLoop(host: OrchestratorHost, loopId: string): Promise<Loop | undefined> {
  const state = await host.readState();
  return state?.loops.find((l) => l.id === loopId);
}

async function replaceLoop(host: OrchestratorHost, loop: Loop): Promise<void> {
  await host.updateState((state) => ({ ...state, loops: state.loops.map((l) => (l.id === loop.id ? loop : l)) }));
}

/** Reflects one loop and persists its new insights + pending suggestions. */
async function reflectLoop(host: OrchestratorHost, loop: Loop): Promise<{ loop: Loop; added: number } | { error: string }> {
  const history = await gatherHistory(host, loop);
  if (history.length === 0) return { error: 'No runs yet — run the loop before reflecting.' };
  const output = await proposeImprovements(host, loop, history);
  const updated = applyReflection(loop, output, host.now());
  await replaceLoop(host, updated);
  return { loop: updated, added: output.suggestions.length };
}

async function reflectOne(host: OrchestratorHost, loopId: string): Promise<OrchestratorActionResult> {
  const loop = await findLoop(host, loopId);
  if (!loop) return { ok: false, error: `Loop not found: ${loopId}` };
  const result = await reflectLoop(host, loop);
  if ('error' in result) return { ok: false, error: result.error };
  return { ok: true, loop: result.loop, reflection: { suggestionCount: result.added } };
}

async function reflectWorkspace(host: OrchestratorHost): Promise<OrchestratorActionResult> {
  const state = await host.readState();
  const loops = state?.loops ?? [];
  const perLoop: ReflectedLoopSummary[] = [];
  let total = 0;
  for (const loop of loops) {
    const result = await reflectLoop(host, loop);
    if ('error' in result) continue; // loops with no run history are skipped
    total += result.added;
    perLoop.push({ loopId: loop.id, title: loop.title, suggestionCount: result.added });
  }
  host.log(`Reflected ${perLoop.length} loop(s) — ${total} suggestion(s)`);
  return { ok: true, workspaceReflection: { reflected: perLoop.length, suggestionCount: total, perLoop } };
}

async function chooseSuggestion(
  host: OrchestratorHost,
  action: Extract<ReflectAction, { kind: 'choose_suggestion' }>,
): Promise<OrchestratorActionResult> {
  const loop = await findLoop(host, action.loopId);
  if (!loop) return { ok: false, error: `Loop not found: ${action.loopId}` };
  const outcome =
    action.decision === 'approve'
      ? approveSuggestion(host, loop, action.suggestionId)
      : rejectSuggestion(loop, action.suggestionId, action.rejectionReason?.trim() || 'Rejected by user.', host.now());
  if (outcome.error || !outcome.loop) return { ok: false, error: outcome.error ?? 'Could not update the suggestion.' };
  await replaceLoop(host, outcome.loop);
  return { ok: true, loop: outcome.loop };
}

export function handleReflectAction(host: OrchestratorHost, action: ReflectAction): Promise<OrchestratorActionResult> {
  switch (action.kind) {
    case 'reflect':
      return reflectOne(host, action.loopId);
    case 'reflect_workspace':
      return reflectWorkspace(host);
    case 'choose_suggestion':
      return chooseSuggestion(host, action);
  }
}
