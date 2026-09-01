/**
 * In-memory OrchestratorHost for tests. Deterministic clock and ids so
 * assertions are stable. Grows alongside the real host interface.
 */

import type {
  AppRuntimeCommandResult,
  AppRuntimePullRequestSummary,
  AppRuntimeSkillSummary,
  AppRuntimeSkillWrite,
  AppRuntimeSkillWriteResult,
  ContextAgentInfo,
  ContextSkillInfo,
  ContextToolInfo,
  ExtensionRuntimeMessage,
  SharedAvailableModelGroup,
} from '@sero-ai/common';
import { OFFICIAL_CATALOG_KEY, OFFICIAL_CATALOG_URL } from '../../shared/catalog';
import { createFakePersistentSessions, type FakePersistentSessions } from './fake-persistent-sessions';
import type { CatalogRepoContents, CatalogRepoRef } from '../../shared/catalog-types';
import { DEFAULT_LIBRARY_INDEX, DEFAULT_STATE } from '../../shared/defaults';
import type { LibraryEntry, LibraryIndex, LibraryVersion, OrchestratorState } from '../../shared/types';
import type {
  AcquireWorktreeRequest,
  AcquireWorktreeResult,
  ActiveSessionInfo,
  ChoiceRequest,
  ChoiceResult,
  ModelRunParams,
  ModelRunResult,
  OrchestratorHost,
  ReattachWorktreeRequest,
  ReleaseWorktreeRequest,
  ReleaseWorktreeResult,
  TurnResult,
  WorkspaceStatus,
  WorktreeLease,
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
  /** Skill catalog returned by listSkillCatalog (empty by default). */
  skillCatalog: ContextSkillInfo[];
  /** Agent-role catalog returned by listAgentCatalog (empty by default). */
  agentCatalog: ContextAgentInfo[];
  /** In-memory artifact store keyed by reference. */
  artifacts: Map<string, string>;
  /** Configurable workspace status for dirty preflight tests. */
  workspaceStatus: WorkspaceStatus;
  /** Configurable choice result for dirty-workspace prompt tests. */
  choiceResult: ChoiceResult;
  /** Holders that acquired a lease, in order. */
  worktreesCreated: string[];
  /** Full acquireWorktree calls, including the existing-branch option. */
  worktreeCreates: { loopId: string; existingBranch?: string }[];
  /** Holders whose lease was released (removed), in order. */
  worktreesRemoved: string[];
  /** Full releaseWorktree calls, resolved back to the holder that owned them. */
  worktreeRemovals: {
    loopId: string;
    slotId: string;
    leaseId: string;
    disposition: string;
    deleteBranch?: boolean;
    deleteMergedBranch?: boolean;
  }[];
  /** Every reattachWorktree call, in order. */
  worktreeReattaches: ReattachWorktreeRequest[];
  /** Live leases by slot id. A released slot is removed. */
  leases: Map<string, WorktreeLease>;
  /** Holders whose acquisition must be blocked, mapped to the reason. */
  acquireBlocks: Map<string, string>;
  /** Release outcomes that override the fenced default, keyed by lease id. */
  releaseOutcomes: Map<string, ReleaseWorktreeResult>;
  /** Checkpoint commits taken, in order. A path in `checkpointFailures` throws instead. */
  checkpoints: { worktreePath: string; message: string }[];
  /** Worktree paths whose checkpoint must fail, mapped to the failure reason. */
  checkpointFailures: Map<string, string>;
  /** Worktree paths with nothing to commit — createCheckpoint returns null for these. */
  cleanWorktrees: Set<string>;
  /** `git diff --name-status` output per worktree path (empty string by default). */
  diffSummaries: Map<string, string>;
  notifications: { message: string; type?: string; subtitle?: string; openApp?: boolean }[];
  choiceRequests: ChoiceRequest[];
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
  /** The context messages themselves, for callers that assert on the content. */
  contextMessages: ExtensionRuntimeMessage[];
  /** Set to make the next context send reject — a closed or unreachable chat. */
  failNextContextSend: string | null;
  /** In-memory Loop Library state (profile-global store stand-in). */
  libraryEntries: Map<string, LibraryEntry>;
  libraryVersions: Map<string, LibraryVersion>;
  libraryIndex: LibraryIndex;
  libraryWatching: boolean;
  /** In-memory Loop Catalog state (git-repo store stand-in). */
  catalogRepos: CatalogRepoRef[];
  /** Cached contents by repo key; absent ⇒ never fetched. */
  catalogContents: Map<string, CatalogRepoContents>;
  /** Always present here; on a real host the capability is usually absent. */
  persistentSessions: FakePersistentSessions;
  /** Same: the gated user-skill capability, recording what a runtime asked to write. */
  skills: FakeSkills;
}

export interface FakeSkills {
  list(): Promise<AppRuntimeSkillSummary[]>;
  write(skill: AppRuntimeSkillWrite): Promise<AppRuntimeSkillWriteResult>;
  /** Skills the profile already holds. */
  existing: AppRuntimeSkillSummary[];
  /** Every write the runtime attempted, in order. */
  written: AppRuntimeSkillWrite[];
}

function createFakeSkills(): FakeSkills {
  return {
    existing: [],
    written: [],
    async list() {
      return this.existing;
    },
    async write(skill) {
      this.written.push(skill);
      const existed = this.existing.some((s) => s.name === skill.name);
      const filePath = `/agent/skills/${skill.name}/SKILL.md`;
      if (!existed) this.existing.push({ name: skill.name, description: skill.description, filePath });
      return { filePath, created: !existed };
    },
  };
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
    skillCatalog: [],
    agentCatalog: [],
    artifacts: new Map<string, string>(),
    workspaceStatus: { isGitRepository: true, hasUncommittedChanges: false, summary: 'Clean working tree' },
    choiceResult: { choiceId: null, timedOut: true },
    worktreesCreated: [],
    worktreeCreates: [],
    worktreesRemoved: [],
    worktreeRemovals: [],
    worktreeReattaches: [],
    leases: new Map<string, WorktreeLease>(),
    acquireBlocks: new Map<string, string>(),
    releaseOutcomes: new Map<string, ReleaseWorktreeResult>(),
    checkpoints: [],
    checkpointFailures: new Map<string, string>(),
    cleanWorktrees: new Set<string>(),
    diffSummaries: new Map<string, string>(),
    notifications: [],
    choiceRequests: [],
    stashes: [],
    pullRequests: [],
    commandResults: [],
    commands: [],
    activeSession: {
      sessionId: 'sess-1',
      workspaceId: options.workspaceId ?? 'ws-1',
      sessionPath: '/sessions/chat-1.jsonl',
    },
    turnResult: { turnId: 'turn-1', status: 'completed' },
    sessionSends: [],
    contextMessages: [],
    failNextContextSend: null,
    libraryEntries: new Map<string, LibraryEntry>(),
    libraryVersions: new Map<string, LibraryVersion>(),
    libraryIndex: structuredClone(DEFAULT_LIBRARY_INDEX),
    libraryWatching: false,
    catalogRepos: [{ key: OFFICIAL_CATALOG_KEY, url: OFFICIAL_CATALOG_URL, official: true }],
    catalogContents: new Map<string, CatalogRepoContents>(),
    persistentSessions: createFakePersistentSessions(),
    skills: createFakeSkills(),

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
    async listSkillCatalog() {
      return this.skillCatalog;
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
    async acquireWorktree(request: AcquireWorktreeRequest): Promise<AcquireWorktreeResult> {
      const blocked = this.acquireBlocks.get(request.holder);
      if (blocked) return { status: 'blocked', reason: blocked };
      const held = [...this.leases.values()].find((lease) => lease.leaseHolder === request.holder);
      if (held) {
        return {
          status: 'blocked',
          reason: `"${request.holder}" already holds slot ${held.slotId}. Reattach instead of acquiring a second checkout.`,
        };
      }
      this.worktreesCreated.push(request.holder);
      this.worktreeCreates.push({ loopId: request.holder, existingBranch: request.existingBranch });
      const ordinal = this.leases.size + this.worktreesRemoved.length + 1;
      const lease: WorktreeLease = {
        slotId: `slot-${ordinal}`,
        // A new identity on EVERY acquisition, including reacquisition by the
        // same holder — the property the real pool guarantees.
        leaseId: this.newId('lease'),
        leaseHolder: request.holder,
        worktreePath: `${this.workspacePath}/.sero/worktrees/${request.holder}`,
        branchName: request.existingBranch ?? `orchestrator/${request.holder}`,
        branchKind: request.existingBranch ? 'external-pr' : 'fresh-task',
        baseRef: 'origin/main',
        baseCommit: 'base0000',
        acquiredHead: 'head0000',
        acquiredAt: this.now(),
        greenfield: false,
      };
      this.leases.set(lease.slotId, lease);
      return { status: 'acquired', lease };
    },
    async reattachWorktree(request: ReattachWorktreeRequest) {
      this.worktreeReattaches.push(request);
      if (request.kind === 'lease') {
        const lease = this.leases.get(request.slotId);
        if (!lease) return { status: 'recovery-required', reason: `No slot ${request.slotId}.` };
        if (lease.leaseId !== request.leaseId) {
          return { status: 'recovery-required', reason: `Slot ${request.slotId} holds a different lease.` };
        }
        if (lease.leaseHolder !== request.holder) {
          return { status: 'recovery-required', reason: `Slot ${request.slotId} belongs to another holder.` };
        }
        return { status: 'attached', lease };
      }
      const adopted: WorktreeLease = {
        slotId: `legacy-${this.leases.size + 1}`,
        leaseId: this.newId('lease'),
        leaseHolder: request.holder,
        worktreePath: request.worktreePath,
        branchName: request.branchName ?? `orchestrator/${request.holder}`,
        branchKind: 'external-pr',
        baseRef: null,
        baseCommit: null,
        acquiredHead: null,
        acquiredAt: this.now(),
        greenfield: false,
      };
      this.leases.set(adopted.slotId, adopted);
      return { status: 'attached', lease: adopted };
    },
    async releaseWorktree(request: ReleaseWorktreeRequest): Promise<ReleaseWorktreeResult> {
      const scripted = this.releaseOutcomes.get(request.expectedLeaseId);
      if (scripted) return scripted;
      const lease = this.leases.get(request.slotId);
      if (!lease) {
        return { status: 'stale-lease', slotId: request.slotId, reason: `No slot ${request.slotId}.` };
      }
      if (lease.leaseId !== request.expectedLeaseId) {
        return {
          status: 'stale-lease',
          slotId: request.slotId,
          reason: `Slot ${request.slotId} now holds lease ${lease.leaseId}.`,
        };
      }
      this.leases.delete(request.slotId);
      this.worktreesRemoved.push(lease.leaseHolder);
      this.worktreeRemovals.push({
        loopId: lease.leaseHolder,
        slotId: request.slotId,
        leaseId: request.expectedLeaseId,
        disposition: request.disposition,
        deleteBranch: request.deleteBranch,
        deleteMergedBranch: request.deleteMergedBranch,
      });
      return { status: 'released', slotId: request.slotId, reason: 'The checkout was released.' };
    },
    async createWorktree(loopId, _title, options) {
      this.worktreesCreated.push(loopId);
      this.worktreeCreates.push({ loopId, existingBranch: options?.existingBranch });
      return {
        worktreePath: `${this.workspacePath}/.sero/worktrees/${loopId}`,
        branchName: options?.existingBranch ?? `orchestrator/${loopId}`,
      };
    },
    async removeWorktree(loopId) {
      this.worktreesRemoved.push(loopId);
    },
    async createCheckpoint(worktreePath, message) {
      const failure = this.checkpointFailures.get(worktreePath);
      if (failure) throw new Error(failure);
      this.checkpoints.push({ worktreePath, message });
      return this.cleanWorktrees.has(worktreePath) ? null : `commit_${this.checkpoints.length}`;
    },
    async getDiffSummary(worktreePath) {
      return this.diffSummaries.get(worktreePath) ?? '';
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
    notify(message, type, options) {
      this.notifications.push({ message, type, subtitle: options?.subtitle, openApp: options?.openApp });
    },
    async requestChoice(request) {
      this.choiceRequests.push(request);
      return this.choiceResult;
    },
    session: {
      async getActiveForWorkspace(_workspaceId, sessionPath) {
        if (sessionPath && host.activeSession?.sessionPath !== sessionPath) return null;
        return host.activeSession;
      },
      async getState() {
        return { idle: true, pendingMessages: 0, activeTurnId: null };
      },
      async sendUserSteer(sessionId) {
        host.sessionSends.push({ sessionId, kind: 'steer' });
        return { turnId: host.turnResult.turnId };
      },
      async sendContextMessage(sessionId, message, options) {
        const failure = host.failNextContextSend;
        if (failure) {
          host.failNextContextSend = null;
          throw new Error(failure);
        }
        host.sessionSends.push({ sessionId, kind: 'context' });
        host.contextMessages.push(message);
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
              catalog: entry.catalog,
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
