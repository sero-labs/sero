import type { AppRuntime, AppRuntimeContext, AppRuntimeModule } from '@sero-ai/common';

import { architectEnabled } from '../shared/kill-switch';

/**
 * The Architect runtime: profile-global, started once, bound to the synthetic
 * `global` workspace. It owns the project records, the wake scheduler, the
 * budget and the verification gate. Skeleton scope: it resolves its home
 * directory and honours the kill switch; the record store and reconcile follow.
 */
class ArchitectRuntime implements AppRuntime {
  private homeDir = '';

  constructor(private readonly ctx: AppRuntimeContext) {}

  async start(): Promise<void> {
    // Disabled by the kill switch: records are kept and nothing is woken.
    if (!architectEnabled()) return;
    this.homeDir = (await this.ctx.host.appState.globalDir('architect')).path;
  }

  async handleStateChange(): Promise<void> {
    // Records are the runtime's own files; the manifest state file carries nothing yet.
  }

  async dispose(): Promise<void> {
    this.homeDir = '';
  }
}

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  return new ArchitectRuntime(ctx);
}

export default {
  createAppRuntime,
} satisfies AppRuntimeModule;
