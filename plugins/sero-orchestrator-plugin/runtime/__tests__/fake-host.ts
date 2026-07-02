/**
 * In-memory OrchestratorHost for tests. Deterministic clock and ids so
 * assertions are stable. Grows alongside the real host interface.
 */

import type {
  AppRuntimeCommandResult,
  AppRuntimePullRequestSummary,
  ContextAgentInfo,
  ContextToolInfo,
  SharedAvailableModelGroup,
} from '@sero-ai/common';
import { OFFICIAL_CATALOG_KEY, OFFICIAL_CATALOG_URL } from '../../shared/catalog';
import type { CatalogRepoContents, CatalogRepoRef } from '../../shared/catalog-types';
import { DEFAULT_LIBRARY_INDEX, DEFAULT_STATE } from '../../shared/defaults';
import type { LibraryEntry, LibraryIndex, LibraryVersion, OrchestratorState } from '../../shared/types';
import type {
  ActiveSessionInfo,
  ChoiceResult,
  ModelRunParams,
  ModelRunResult,
  OrchestratorHost,
  TurnResult,
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
  /** When set, now() returns this fixed ISO string instead of advancing. */
  frozenNow?: string;
  /** Scripted model responses consumed FIFO by runStructured. */
  modelResponses: ModelRunResult[];
  /** Records every runStructured call for assertions. */
  modelCalls: ModelRunParams[];
  /** Model groups returned by listAvailableModels (empty by default). */
  availableModels: SharedAvailableModelGroup[];
  /** Tool catalog returned by listToolCatalog (empty by default). */
  toolCatalog: ContextToolInfo[];
  /** Agent-role catalog returned by listAgentCatalog (empty by default). */
  agentCatalog: ContextAgentInfo[];
  /** In-memory artifact store keyed by reference. */
  artifacts: Map<string, string>;
  /** Configurable workspace status for dirty preflight tests. */
  workspaceStatus: WorkspaceStatus;
  /** Configurable choice result for dirty-workspace prompt tests. */
  choiceResult: ChoiceResult;
  /** Records created/removed worktrees and notifications/choices. */
  worktreesCreated: string[];
  worktreesRemoved: string[];
  /** Full removeWorktree calls, including the options passed. */
  worktreeRemovals: { loopId: string; deleteBranch?: boolean; force?: boolean }[];
  notifications: { message: string; type?: string }[];
  choiceRequests: { title: string; body: string }[];
  stashes: string[];
  /** Open PRs returned by listPullRequests (empty by default). */
  pullRequests: AppRuntimePullRequestSummary[];
  /** Scripted runCommand results consumed FIFO (default: exit 0, empty output). */
  commandResults: AppRuntimeCommandResult[];
  /** Records every runCommand invocation. */
  commands: string[];
  /** Active session returned by session.getActiveForWorkspace (null = none). */
  activeSession: ActiveSessionInfo | null;
  /** Turn result delivered to the next onTurnComplete subscriber. */
  turnResult: TurnResult;
  /** Records active-session sends. */
  sessionSends: { sessionId: string; kind: 'steer' | 'context' }[];
  /** In-memory Loop Library state (profile-global store stand-in). */
  libraryEntries: Map<string, LibraryEntry>;
  libraryVersions: Map<string, LibraryVersion>;
  libraryIndex: LibraryIndex;
  libraryWatching: boolean;
  /** In-memory Loop Catalog state (git-repo store stand-in). */
  catalogRepos: CatalogRepoRef[];
  /** Cached contents by repo key; absent ⇒ never fetched. */
  catalogContents: Map<string, CatalogRepoContents>;
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
    availableModels: [],
    toolCatalog: [],
    agentCatalog: [],
    artifacts: new Map<string, string>(),
    workspaceStatus: { isGitRepository: true, hasUncommittedChanges: false, summary: 'Clean working tree' },
    choiceResult: { choiceId: null, timedOut: true },
    worktreesCreated: [],
    worktreesRemoved: [],
    worktreeRemovals: [],
    notifications: [],
    choiceRequests: [],
    stashes: [],
    pullRequests: [],
    commandResults: [],
    commands: [],
    activeSession: { sessionId: 'sess-1', workspaceId: options.workspaceId ?? 'ws-1' },
    turnResult: { turnId: 'turn-1', status: 'completed' },
    sessionSends: [],
    libraryEntries: new Map<string, LibraryEntry>(),
    libraryVersions: new Map<string, LibraryVersion>(),
    libraryIndex: structuredClone(DEFAULT_LIBRARY_INDEX),
    libraryWatching: false,
    catalogRepos: [{ key: OFFICIAL_CATALOG_KEY, url: OFFICIAL_CATALOG_URL, official: true }],
    catalogContents: new Map<string, CatalogRepoContents>(),

    async readState() {
      return structuredClone(this.state);
    },
    async updateState(updater) {
      this.state = updater(structuredClone(this.state));
    },
    async runStructured(params) {
      this.modelCalls.push(params);
      let result = this.modelResponses.shift() ?? { response: '', error: 'no scripted model response' };
      // Simulate in-session repair: while the caller rejects the reply, consume
      // the next scripted response (the same session would re-prompt here).
      if (params.repair && !result.error) {
        for (let i = 0; i < params.repair.maxAttempts; i += 1) {
          if (params.repair.validate(result.response) == null) break;
          const next = this.modelResponses.shift();
          if (!next) break;
          result = next;
        }
      }
      return result;
    },
    async listAvailableModels() {
      return this.availableModels;
    },
    async listToolCatalog() {
      return this.toolCatalog;
    },
    async listAgentCatalog() {
      return this.agentCatalog;
    },
    async writeArtifact(relativePath, content) {
      const ref = `artifact://${relativePath}`;
      this.artifacts.set(ref, content);
      return ref;
    },
    async readArtifact(ref) {
      // Mirror the real host: accept the write ref OR a state-dir-relative path.
      return this.artifacts.get(ref) ?? this.artifacts.get(`artifact://${ref}`) ?? null;
    },
    async createWorktree(loopId) {
      this.worktreesCreated.push(loopId);
      return { worktreePath: `${this.workspacePath}/.sero/worktrees/${loopId}`, branchName: `orchestrator/${loopId}` };
    },
    async removeWorktree(loopId, options) {
      this.worktreesRemoved.push(loopId);
      this.worktreeRemovals.push({ loopId, deleteBranch: options?.deleteBranch, force: options?.force });
    },
    async getWorkspaceStatus() {
      return this.workspaceStatus;
    },
    async stashWorkspaceChanges(message) {
      this.stashes.push(message);
      return { stashRef: `stash@{0}:${message}` };
    },
    async listPullRequests() {
      return this.pullRequests;
    },
    async runCommand(command) {
      this.commands.push(command);
      return this.commandResults.shift() ?? { stdout: '', stderr: '', exitCode: 0 };
    },
    notify(message, type) {
      this.notifications.push({ message, type });
    },
    async requestChoice(request) {
      this.choiceRequests.push({ title: request.title, body: request.body });
      return this.choiceResult;
    },
    session: {
      async getActiveForWorkspace() {
        return host.activeSession;
      },
      async getState() {
        return { idle: true, pendingMessages: 0, activeTurnId: null };
      },
      async sendUserSteer(sessionId) {
        host.sessionSends.push({ sessionId, kind: 'steer' });
        return { turnId: host.turnResult.turnId };
      },
      async sendContextMessage(sessionId, _message, options) {
        host.sessionSends.push({ sessionId, kind: 'context' });
        return { turnId: options.triggerTurn ? host.turnResult.turnId : null };
      },
      onTurnComplete(_sessionId, cb) {
        const timer = setTimeout(() => cb(host.turnResult), 0);
        return () => clearTimeout(timer);
      },
    },
    library: {
      async dir() {
        return '/library';
      },
      async readIndex() {
        return structuredClone(host.libraryIndex);
      },
      async readEntry(entryId) {
        const entry = host.libraryEntries.get(entryId);
        return entry ? structuredClone(entry) : null;
      },
      async readVersion(entryId, version) {
        const found = host.libraryVersions.get(`${entryId}@${version}`);
        return found ? structuredClone(found) : null;
      },
      async putVersion(entry, version) {
        host.libraryEntries.set(entry.id, structuredClone(entry));
        host.libraryVersions.set(`${entry.id}@${version.version}`, structuredClone(version));
        host.libraryIndex = {
          version: 1,
          entries: [
            ...host.libraryIndex.entries.filter((e) => e.id !== entry.id),
            {
              id: entry.id,
              name: entry.name,
              summary: entry.summary,
              latestVersion: entry.latestVersion,
              versionCount: entry.latestVersion,
              updatedAt: entry.updatedAt,
            },
          ],
        };
      },
      async deleteEntry(entryId) {
        host.libraryEntries.delete(entryId);
        for (const key of [...host.libraryVersions.keys()]) {
          if (key.startsWith(`${entryId}@`)) host.libraryVersions.delete(key);
        }
        host.libraryIndex = {
          version: 1,
          entries: host.libraryIndex.entries.filter((e) => e.id !== entryId),
        };
      },
      async watchIndex() {
        host.libraryWatching = true;
      },
      async unwatchIndex() {
        host.libraryWatching = false;
      },
    },
    catalog: {
      async listRepos() {
        return structuredClone(host.catalogRepos);
      },
      async addRepo(url) {
        const repo: CatalogRepoRef = { key: `repo-${host.catalogRepos.length}`, url, official: false };
        host.catalogRepos.push(repo);
        return structuredClone(repo);
      },
      async removeRepo(key) {
        if (key === OFFICIAL_CATALOG_KEY) throw new Error('the official catalog cannot be removed');
        host.catalogRepos = host.catalogRepos.filter((r) => r.key !== key);
        host.catalogContents.delete(key);
      },
      async refresh(key) {
        const contents = host.catalogContents.get(key);
        return contents ? { root: `/catalog/${key}`, stale: false } : { root: null, stale: false, reason: 'no fake contents' };
      },
      async readContents(key) {
        const repo = host.catalogRepos.find((r) => r.key === key);
        if (!repo) throw new Error(`unknown catalog repo: ${key}`);
        const contents = host.catalogContents.get(key);
        return contents ? structuredClone(contents) : { repo: structuredClone(repo), index: null, entries: [], problems: [] };
      },
      async readEntry(key, slug) {
        const found = host.catalogContents.get(key)?.entries.find((e) => e.meta.slug === slug);
        return found ? structuredClone(found) : null;
      },
    },
    now() {
      if (this.frozenNow) return this.frozenNow;
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
