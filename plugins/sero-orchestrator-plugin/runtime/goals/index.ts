/**
 * Assembles the Goal half of the Orchestrator runtime, so runtime/index.ts
 * stays small and the Goal wiring — store, supervision, session lock — reads as
 * one unit, the way `room-runtime.ts` does for Rooms.
 */

import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';

import type { OrchestratorHost } from '../host';
import type { SessionDrivers } from '../session-drivers';
import { createGoalStore } from './goal-store';
import { GoalRuntime } from './goal-runtime';

/**
 * The emergency kill switch. Goal mode is on by default. Set `SERO_GOALS=0` or
 * `false` before Sero starts to disable it without deleting goal records; the
 * in-session surfaces then find no runtime and say so.
 */
export function goalModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.SERO_GOALS?.trim().toLowerCase();
  return flag !== '0' && flag !== 'false';
}

export function createGoalRuntime(
  ctx: AppRuntimeContext,
  host: OrchestratorHost,
  drivers: SessionDrivers,
): GoalRuntime | null {
  if (!goalModeEnabled()) return null;
  const store = createGoalStore(
    {
      read: (file) => ctx.host.appState.read(file),
      // Atomic write that also triggers the file watcher the UI subscribes to.
      write: (file, data) => ctx.host.appState.update(file, () => data),
      remove: (file) => ctx.host.appState.remove(file),
    },
    path.dirname(ctx.stateFilePath),
  );
  return new GoalRuntime(host, store, drivers);
}

export { GoalRuntime } from './goal-runtime';
