import type { AppRuntime, AppRuntimeContext, AppRuntimeModule } from '@sero-ai/common';

import { architectEnabled } from '../shared/kill-switch';
import { createArchitectHost, type ArchitectHost } from './host';
import { createRecordStore, type RecordStore } from './record-store';
import { reconcileProjects } from './reconcile';
import { createWakeGate, type WakeGate } from './wake-gate';

/**
 * The Architect runtime: profile-global, started once, bound to the synthetic
 * `global` workspace. It owns the project records, the wake scheduler, the
 * budget and the verification gate.
 */
export class ArchitectRuntime implements AppRuntime {
  private store: RecordStore | null = null;
  readonly gate: WakeGate = createWakeGate();

  constructor(private readonly host: ArchitectHost, private readonly env: NodeJS.ProcessEnv = process.env) {}

  async start(): Promise<void> {
    // Disabled by the kill switch: records are kept and nothing is woken.
    if (!architectEnabled(this.env)) return;
    const homeDir = await this.host.homeDir();
    this.store = createRecordStore({ homeDir, indexFile: this.host.indexFile, updateIndex: this.host.updateIndex });
    // Reconcile before the gate opens, so no wake can run on unconfirmed state.
    const { held } = await reconcileProjects(this.store, this.host);
    if (held.length > 0) this.host.log(`held ${held.length} project(s) whose workspace is missing: ${held.join(', ')}`);
    this.gate.release();
  }

  /** The store, once started. Absent while disabled or before start. */
  records(): RecordStore | null {
    return this.store;
  }

  async handleStateChange(): Promise<void> {
    // The index is the runtime's own output; nothing to react to here.
  }

  async dispose(): Promise<void> {
    this.store = null;
  }
}

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  return new ArchitectRuntime(createArchitectHost(ctx));
}

export default {
  createAppRuntime,
} satisfies AppRuntimeModule;
