/**
 * In-memory OrchestratorHost for tests. Deterministic clock and ids so
 * assertions are stable. Grows alongside the real host interface.
 */

import { DEFAULT_STATE } from '../../shared/defaults';
import type { OrchestratorState } from '../../shared/types';
import type { OrchestratorHost } from '../host';

export interface FakeHostOptions {
  workspaceId?: string;
  workspacePath?: string;
  stateDir?: string;
  initialState?: OrchestratorState;
}

export interface FakeHost extends OrchestratorHost {
  state: OrchestratorState;
  logs: string[];
  idCounter: number;
  clockMs: number;
}

export function createFakeHost(options: FakeHostOptions = {}): FakeHost {
  const host: FakeHost = {
    workspaceId: options.workspaceId ?? 'ws-1',
    workspacePath: options.workspacePath ?? '/workspaces/ws-1',
    stateDir: options.stateDir ?? '/workspaces/ws-1/.sero/apps/orchestrator',
    state: options.initialState ?? structuredClone(DEFAULT_STATE),
    logs: [],
    idCounter: 0,
    clockMs: Date.parse('2026-01-01T00:00:00.000Z'),

    async readState() {
      return structuredClone(this.state);
    },
    async updateState(updater) {
      this.state = updater(structuredClone(this.state));
    },
    now() {
      // Advance one second per call so ordering is deterministic and distinct.
      this.clockMs += 1000;
      return new Date(this.clockMs).toISOString();
    },
    newId(prefix) {
      this.idCounter += 1;
      const suffix = String(this.idCounter).padStart(4, '0');
      return prefix ? `${prefix}_${suffix}` : suffix;
    },
    log(message) {
      this.logs.push(message);
    },
  };
  return host;
}
