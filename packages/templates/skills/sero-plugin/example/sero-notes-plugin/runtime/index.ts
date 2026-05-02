import type {
  AppRuntime,
  AppRuntimeContext,
  AppRuntimeModule,
} from '@sero-ai/common';

import type { NotesState } from '../shared/types';
import { normalizeNotesState } from '../shared/types';

// A background runtime is optional. Use it only for long-lived, workspace-scoped
// orchestration (startup reconcile, subagent workflows, watchers beyond simple
// UI sync). Simple CRUD belongs in the extension, not here.
class NotesRuntime implements AppRuntime {
  constructor(private readonly ctx: AppRuntimeContext) {}

  async start(): Promise<void> {
    // Startup reconcile — read the current state and run once.
    const state = await this.ctx.host.appState.read<NotesState>(
      this.ctx.stateFilePath,
    );
    if (state) await this.handleStateChange(state);
  }

  async handleStateChange(state: unknown): Promise<void> {
    const current = normalizeNotesState(state);

    // Example orchestration: auto-prune notes flagged done for > 30 days.
    // Kept as a pure read for the reference; a real runtime would mutate state
    // via this.ctx.host.appState.update(...) or call a subagent via
    // this.ctx.host.subagents.runStructured(...).
    const stale = current.notes.filter(
      (n) =>
        n.done &&
        Date.now() - Date.parse(n.createdAt) > 30 * 24 * 60 * 60 * 1000,
    );
    if (stale.length > 0) {
      // In a real plugin, reconcile here. Left as a no-op for the example.
    }
  }

  async dispose(): Promise<void> {
    // Clean up any listeners, timers, or file watchers you opened in start().
  }
}

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  return new NotesRuntime(ctx);
}

export default {
  createAppRuntime,
} satisfies AppRuntimeModule;
