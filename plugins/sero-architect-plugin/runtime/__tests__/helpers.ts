/**
 * Fakes for runtime tests: a host on a temp dir, a fake persistent-sessions
 * API whose turns the test controls, and record fixtures.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  PersistentSessionEvent,
  PersistentSessionGrantHandle,
  PersistentSessionGrantProposal,
  PersistentSessionRequest,
  PersistentSessionsApi,
} from '@sero-ai/common';
import { advancePhase, approveCharter, settle } from '../../shared/lifecycle';
import { createProjectRecord, type Milestone, type ProjectRecord } from '../../shared/record';
import type { ArchitectIndex } from '../../shared/types';
import type { ArchitectHost, CommandRun } from '../host';
import { createRecordStore, type RecordStore } from '../record-store';

export const T0 = '2026-09-07T09:00:00.000Z';

export interface FakeSessionsApi extends PersistentSessionsApi {
  proposals: PersistentSessionGrantProposal[];
  requests: PersistentSessionRequest[];
  prompts: { handleId: string; content: string }[];
  steers: { handleId: string; content: string }[];
  disposed: string[];
  deletedGrants: string[];
  /** What happens during a turn; the test drives owner actions from here. */
  onTurn: ((handleId: string, content: string) => Promise<void>) | null;
  /** Emits an event to every subscriber of a handle (compaction, for instance). */
  emit(handleId: string, event: PersistentSessionEvent): void;
  costUsd: number;
  denyGrant: boolean;
  sessionPath: string;
}

export function fakeSessionsApi(sessionPath = '/sessions/owner.jsonl'): FakeSessionsApi {
  const subscribers = new Map<string, Set<(event: PersistentSessionEvent) => void>>();
  let turn = 0;
  const api: FakeSessionsApi = {
    proposals: [],
    requests: [],
    prompts: [],
    steers: [],
    disposed: [],
    deletedGrants: [],
    onTurn: null,
    costUsd: 0,
    denyGrant: false,
    sessionPath,
    emit(handleId, event) {
      for (const cb of subscribers.get(handleId) ?? []) cb(event);
    },
    async requestGrant(proposal) {
      api.proposals.push(proposal);
      if (api.denyGrant) throw new Error('the user declined');
      const handle: PersistentSessionGrantHandle = {
        grantId: 'grant-1',
        subjects: proposal.subjects,
        maxLiveSessions: proposal.maxLiveSessions,
        maxTotalSessions: proposal.maxTotalSessions,
        issuedAt: T0,
      };
      return handle;
    },
    async revokeGrant() {},
    async deleteGrant(grantId) { api.deletedGrants.push(grantId); },
    async create(request) {
      api.requests.push(request);
      return { handleId: 'h1', subject: request.subject, sessionId: 'sess-1', sessionPath };
    },
    async open(request) {
      api.requests.push(request);
      return { handleId: 'h1', subject: request.subject, sessionId: 'sess-1', sessionPath };
    },
    async prompt(handleId, content) {
      const text = typeof content === 'string' ? content : JSON.stringify(content);
      api.prompts.push({ handleId, content: text });
      const turnId = `turn-${++turn}`;
      queueMicrotask(async () => {
        api.emit(handleId, { type: 'turn_start', turnId });
        await api.onTurn?.(handleId, text);
        api.emit(handleId, { type: 'turn_end', turnId, status: 'completed' });
      });
      return { turnId };
    },
    async steer(handleId, content) {
      api.steers.push({ handleId, content: typeof content === 'string' ? content : JSON.stringify(content) });
    },
    async abort() {},
    subscribe(handleId, cb) {
      const set = subscribers.get(handleId) ?? new Set();
      set.add(cb);
      subscribers.set(handleId, set);
      return () => { set.delete(cb); };
    },
    async compact() {},
    async getContextUsage() { return { usedTokens: 0, maxTokens: 1 }; },
    async getSessionUsage() {
      return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: api.costUsd, turns: turn };
    },
    async dispose(handleId) { api.disposed.push(handleId); },
    async readHistory() { return { entries: [], olderCursor: null }; },
  };
  return api;
}

export interface FakeHost extends ArchitectHost {
  index: () => ArchitectIndex | null;
  logs: string[];
  notices: string[];
  execCalls: { file: string; args: string[]; cwd: string }[];
  commandRuns: { workspaceId: string; cwd: string; command: string }[];
  /** Exit code and output per command; default success. */
  commandResults: Record<string, CommandRun>;
  execResults: Record<string, CommandRun>;
  stateListeners: Map<string, Set<(state: unknown) => void>>;
  jsonFiles: Record<string, unknown>;
  emitState(filePath: string, state: unknown): void;
  sessions: FakeSessionsApi;
  workspaces: { id: string; name: string; path: string; open: boolean }[];
  clock: string[];
}

const dirs: string[] = [];

export async function cleanupHosts(): Promise<void> {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
}

export async function fakeHost(options: { workspaces?: FakeHost['workspaces']; sessions?: FakeSessionsApi } = {}): Promise<FakeHost> {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'architect-'));
  dirs.push(homeDir);
  let index: ArchitectIndex | null = null;
  let ids = 0;
  const sessions = options.sessions ?? fakeSessionsApi();
  const host: FakeHost = {
    homeDir: async () => homeDir,
    indexFile: path.join(homeDir, 'state.json'),
    updateIndex: async (updater) => { index = updater(index); },
    listWorkspaces: async () => host.workspaces,
    createWorkspace: async (name, parentPath) => {
      const ws = { id: `ws-${name}`, name, path: path.join(parentPath, name), open: true };
      host.workspaces.push(ws);
      return ws;
    },
    persistentSessions: sessions,
    listModels: async () => [{ provider: 'anthropic', displayName: 'Anthropic', logo: '', models: [
      { provider: 'anthropic', modelId: 'claude-fable-5-1', name: 'Fable', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] },
    ] }],
    runStructured: async () => ({ response: 'research answer', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, costUsd: 0.5 } }),
    runCommand: async (workspaceId, cwd, command) => {
      host.commandRuns.push({ workspaceId, cwd, command });
      return host.commandResults[command] ?? { exitCode: 0, stdout: 'ok', stderr: '' };
    },
    exec: async (file, args, cwd) => {
      host.execCalls.push({ file, args, cwd });
      return host.execResults[`${file} ${args.join(' ')}`] ?? { exitCode: 0, stdout: '', stderr: '' };
    },
    detectDevServerCommand: async () => null,
    startDevServer: async () => ({ reason: 'no dev server in tests' }),
    stopDevServer: async () => true,
    onStateChange: (filePath, listener) => {
      const set = host.stateListeners.get(filePath) ?? new Set();
      set.add(listener);
      host.stateListeners.set(filePath, set);
      return () => { set.delete(listener); };
    },
    readJson: async (filePath) => host.jsonFiles[filePath] ?? null,
    fileInfo: async () => null,
    notify: (message) => { host.notices.push(message); },
    now: () => host.clock.shift() ?? T0,
    newId: (prefix) => `${prefix}_${++ids}`,
    log: (message) => { host.logs.push(message); },
    env: {},
    index: () => index,
    logs: [],
    notices: [],
    execCalls: [],
    commandRuns: [],
    commandResults: {},
    execResults: {},
    stateListeners: new Map(),
    jsonFiles: {},
    emitState: (filePath, state) => {
      for (const cb of host.stateListeners.get(filePath) ?? []) cb(state);
    },
    sessions,
    workspaces: options.workspaces ?? [{ id: 'ws-1', name: 'hollow', path: '/home/dan/projects/hollow', open: true }],
    clock: [],
  };
  return host;
}

export async function storeFor(host: FakeHost): Promise<RecordStore> {
  return createRecordStore({ homeDir: await host.homeDir(), indexFile: host.indexFile, updateIndex: host.updateIndex });
}

export function milestone(id: string, overrides: Partial<Milestone> = {}): Milestone {
  return { id, title: `Milestone ${id}`, status: 'planned', plan: 'the plan', preview: null, dispatch: null, evidence: null, verification: null, parkedBy: null, parkedFrom: null, receipt: null, ...overrides };
}

/** A project in build with an approved charter, an owner grant and an open session. */
export function buildingProject(overrides: Partial<ProjectRecord> = {}, sessionPath = '/sessions/owner.jsonl'): ProjectRecord {
  const base = createProjectRecord({ id: 'proj_1', name: 'Hollow', idea: 'A roguelike.', folder: '/home/dan/projects/hollow', now: T0 });
  const withWorkspace: ProjectRecord = {
    ...base,
    workspaceId: 'ws-1',
    charter: { milestoneIds: ['m1', 'm2'], escalationPolicy: 'raise scope changes', autonomy: 'milestones', capUsd: 40, proposedAt: T0, approvedAt: null },
    milestones: [milestone('m1'), milestone('m2')],
    session: { ...base.session, grantId: 'grant-1', sessionId: 'sess-1', sessionPath, grantedTools: ['read', 'bash', 'write', 'edit', 'sero-cli'], model: 'anthropic/claude-fable-5-1', thinking: 'medium' },
  };
  const discovery = advancePhase(withWorkspace, 'discovery', T0, 'test');
  const charter = discovery.ok ? advancePhase(discovery.record, 'charter', T0, 'test') : discovery;
  const approved = charter.ok ? approveCharter(charter.record, T0) : charter;
  const build = approved.ok ? advancePhase(approved.record, 'build', T0, 'test') : approved;
  if (!build.ok) throw new Error(build.error);
  // Overrides change the flags the overlay is derived from, so settle again.
  return settle({ ...build.record, ...overrides }, T0);
}
