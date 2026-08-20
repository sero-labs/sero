import type { GraphifyNotice, GraphifyState } from '../shared/types';
import type { BuildOutcome } from './graphify-runner';
import type { SpendHost } from './spend-guard';

export interface IndexerWorkspace {
  id: string;
  name: string;
  path: string;
  open: boolean;
}

export interface JobHooks {
  onProgress?: (message: string) => void;
  /** Fires at the last moment before a paid child process starts. */
  beforePaidSpawn?: () => Promise<void>;
}

export interface IndexerHost extends SpendHost {
  readState(): Promise<GraphifyState | null>;
  updateState(updater: (current: GraphifyState) => GraphifyState): Promise<void>;
  listWorkspaces(): Promise<IndexerWorkspace[]>;
  ensureProvisioned(): Promise<void>;
  buildGraph(workspace: { workspaceId: string; path: string }, settings: GraphifyState['settings'], hooks: JobHooks): Promise<BuildOutcome>;
  nameCommunities(workspace: { workspaceId: string; path: string }, settings: GraphifyState['settings'], hooks: JobHooks): Promise<BuildOutcome>;
  updateGraph(workspace: { workspaceId: string; path: string }, settings: GraphifyState['settings'], hooks: JobHooks): Promise<BuildOutcome>;
  mergeProfileGraph(workspaceIds: string[]): Promise<{ nodes: number; edges: number }>;
  removeWorkspaceArtifacts(workspaceId: string): Promise<void>;
  listArtifactWorkspaceIds(): Promise<string[]>;
  graphExists(workspaceId: string): Promise<boolean>;
  graphifyVersion(): Promise<string | undefined>;
  upgradeGraphify(version: string): Promise<void>;
  notify(notice: GraphifyNotice): void;
  log(message: string): void;
}
