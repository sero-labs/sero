// Durable state access — the one place the coordinator core reads and writes
// `OrchestratorState` through `host.appState` (02 §App state). `appState.update`
// serializes writes per file (atomic tmp+rename), so every mutator here runs
// against a fresh, normalized snapshot. It does NOT provide execution mutual
// exclusion — the per-loop lock does that (D-11, see locks.ts).

import type { AppRuntimeHost } from '@sero-ai/common';

import {
  DEFAULT_STATE,
  normalizeOrchestratorState,
  type LoopGoal,
  type OrchestratorState,
} from '../shared/types';

export class StateStore {
  constructor(
    private readonly host: AppRuntimeHost,
    private readonly stateFilePath: string,
  ) {}

  async read(): Promise<OrchestratorState> {
    const raw = await this.host.appState.read<OrchestratorState>(this.stateFilePath);
    return raw ? normalizeOrchestratorState(raw) : { ...DEFAULT_STATE };
  }

  async getLoop(loopId: string): Promise<LoopGoal | null> {
    const state = await this.read();
    return state.loops.find((loop) => loop.id === loopId) ?? null;
  }

  /**
   * Apply `mutate` to the persisted state. The mutator returns the loop it
   * touched (or null) so the caller can echo it back without a second read.
   */
  async mutate(
    mutate: (state: OrchestratorState) => LoopGoal | null,
  ): Promise<LoopGoal | null> {
    let touched: LoopGoal | null = null;
    await this.host.appState.update<OrchestratorState>(this.stateFilePath, (current) => {
      const state = current ? normalizeOrchestratorState(current) : { ...DEFAULT_STATE };
      touched = mutate(state);
      return state;
    });
    return touched;
  }

  /** Mutate a single loop by id; the loop is omitted from the write if absent. */
  async updateLoop(
    loopId: string,
    apply: (loop: LoopGoal) => void,
  ): Promise<LoopGoal | null> {
    return this.mutate((state) => {
      const loop = state.loops.find((candidate) => candidate.id === loopId);
      if (!loop) return null;
      apply(loop);
      return loop;
    });
  }
}
