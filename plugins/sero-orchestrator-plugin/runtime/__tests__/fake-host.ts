/**
 * In-memory OrchestratorHost for tests. Deterministic clock and ids so
 * assertions are stable. Grows alongside the real host interface.
 */

import { DEFAULT_STATE } from '../../shared/defaults';
import type { OrchestratorState } from '../../shared/types';
import type {
  ChoiceResult,
  ModelRunParams,
  ModelRunResult,
  OrchestratorHost,
  WorkspaceStatus,
} from '../host';

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
  /** Scripted model responses consumed FIFO by runStructured. */
  modelResponses: ModelRunResult[];
  /** Records every runStructured call for assertions. */
  modelCalls: ModelRunParams[];
  /** In-memory artifact store keyed by reference. */
  artifacts: Map<string, string>;
  /** Configurable workspace status for dirty preflight tests. */
  workspaceStatus: WorkspaceStatus;
  /** Configurable choice result for dirty-workspace prompt tests. */
  choiceResult: ChoiceResult;
  /** Records created/removed worktrees and notifications/choices. */
  worktreesCreated: string[];
  worktreesRemoved: string[];
  notifications: { message: string; type?: string }[];
  choiceRequests: { title: string; body: string }[];
  stashes: string[];
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
    modelResponses: [],
    modelCalls: [],
    artifacts: new Map<string, string>(),
    workspaceStatus: { isGitRepository: true, hasUncommittedChanges: false, summary: 'Clean working tree' },
    choiceResult: { choiceId: null, timedOut: true },
    worktreesCreated: [],
    worktreesRemoved: [],
    notifications: [],
    choiceRequests: [],
    stashes: [],

    async readState() {
      return structuredClone(this.state);
    },
    async updateState(updater) {
      this.state = updater(structuredClone(this.state));
    },
    async runStructured(params) {
      this.modelCalls.push(params);
      const next = this.modelResponses.shift();
      return next ?? { response: '', error: 'no scripted model response' };
    },
    async writeArtifact(relativePath, content) {
      const ref = `artifact://${relativePath}`;
      this.artifacts.set(ref, content);
      return ref;
    },
    async readArtifact(ref) {
      return this.artifacts.get(ref) ?? null;
    },
    async createWorktree(loopId) {
      this.worktreesCreated.push(loopId);
      return { worktreePath: `${this.workspacePath}/.sero/worktrees/${loopId}`, branchName: `orchestrator/${loopId}` };
    },
    async removeWorktree(loopId) {
      this.worktreesRemoved.push(loopId);
    },
    async getWorkspaceStatus() {
      return this.workspaceStatus;
    },
    async stashWorkspaceChanges(message) {
      this.stashes.push(message);
      return { stashRef: `stash@{0}:${message}` };
    },
    notify(message, type) {
      this.notifications.push({ message, type });
    },
    async requestChoice(request) {
      this.choiceRequests.push({ title: request.title, body: request.body });
      return this.choiceResult;
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
