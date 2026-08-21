export interface AutoContextSettings {
  sessionSummary: boolean;
  augmentSearchResults: boolean;
  autoQuery: boolean;
  maxSessionAugments: number;
  maxAugmentChars: number;
}

export interface GraphifySettings {
  /** Glob patterns passed as repeated --exclude flags. */
  exclude: string[];
  /** Stops queued and new indexing work. */
  paused: boolean;
  autoContext: AutoContextSettings;
}

export interface WorkspaceIndexStats {
  nodes: number;
  edges: number;
  communities: number;
  /** Code-only builds must keep both token counts at zero. */
  inputTokens: number;
  outputTokens: number;
  graphifyVersion?: string;
}

export type WorkspaceIndexStatus =
  | 'idle'
  | 'queued'
  | 'building'
  | 'updating'
  | 'error'
  | 'needs-build';

export interface WorkspaceIndexEntry {
  workspaceId: string;
  name: string;
  path: string;
  enabled: boolean;
  status: WorkspaceIndexStatus;
  lastBuiltAt?: string;
  lastError?: string;
  stats?: WorkspaceIndexStats;
  progress?: string;
  lastAttemptAt?: string;
  failureCount?: number;
}

export interface RemovedWorkspaceRecord {
  workspaceId: string;
  name: string;
  removedAt: string;
  stats?: WorkspaceIndexStats;
}

export type IndexAction = 'enable' | 'disable' | 'rebuild' | 'refresh' | 'enable-all' | 'sync' | 'upgrade' | 'settings';

export interface SettingsPatch {
  paused?: boolean;
  exclude?: string[];
  clearNotice?: boolean;
}

export interface IndexRequest {
  id: number;
  action: IndexAction;
  workspaceId?: string;
  settings?: SettingsPatch;
  requestedAt: string;
}

export type ProvisioningStatus = 'uninitialized' | 'installing' | 'ready' | 'failed';

export interface ProvisioningState {
  status: ProvisioningStatus;
  uvPath?: string;
  graphifyPath?: string;
  version?: string;
  error?: string;
  updatedAt?: string;
  availableVersion?: string;
}

export interface ProfileGraphState {
  status: 'absent' | 'merging' | 'ready' | 'failed';
  mergedAt?: string;
  nodes?: number;
  edges?: number;
  workspaceIds?: string[];
  error?: string;
}

export interface GraphifyNotice {
  message: string;
  at: string;
  kind: 'refused' | 'info';
}

export interface GraphifyState {
  settings: GraphifySettings;
  provisioning: ProvisioningState;
  workspaces: Record<string, WorkspaceIndexEntry>;
  requests: IndexRequest[];
  nextRequestId: number;
  lastAppliedRequestId: number;
  profileGraph: ProfileGraphState;
  removedWorkspaces: RemovedWorkspaceRecord[];
  notice: GraphifyNotice | null;
}

export const DEFAULT_STATE: GraphifyState = Object.freeze({
  settings: {
    exclude: ['node_modules', 'dist', 'build', 'out', '.git', '*.lock', '*.min.js', '*.map'],
    paused: false,
    autoContext: {
      sessionSummary: true,
      augmentSearchResults: true,
      autoQuery: false,
      maxSessionAugments: 8,
      maxAugmentChars: 1200,
    },
  },
  provisioning: { status: 'uninitialized' },
  workspaces: {},
  requests: [],
  nextRequestId: 1,
  lastAppliedRequestId: 0,
  profileGraph: { status: 'absent' },
  removedWorkspaces: [],
  notice: null,
} satisfies GraphifyState);

/** The global workspace contains profile memory, not a source repository. */
export function isIndexableWorkspace(workspaceId: string): boolean {
  return workspaceId !== 'global';
}

/** Read current and legacy state files into the free code-indexing shape. */
export function withStateDefaults(raw: GraphifyState | null | undefined): GraphifyState {
  const defaults = structuredClone(DEFAULT_STATE);
  if (!raw) return defaults;
  return {
    // Keep unknown fields from the paid-build design so migration does not
    // erase historical records. Current code does not read or change them.
    ...raw,
    settings: {
      ...raw.settings,
      exclude: raw.settings?.exclude ?? defaults.settings.exclude,
      paused: raw.settings?.paused ?? defaults.settings.paused,
      autoContext: {
        ...defaults.settings.autoContext,
        ...raw.settings?.autoContext,
      },
    },
    provisioning: { ...defaults.provisioning, ...raw.provisioning },
    workspaces: raw.workspaces ?? {},
    requests: raw.requests ?? [],
    nextRequestId: raw.nextRequestId ?? 1,
    lastAppliedRequestId: raw.lastAppliedRequestId ?? 0,
    profileGraph: { ...defaults.profileGraph, ...raw.profileGraph },
    removedWorkspaces: raw.removedWorkspaces ?? [],
    notice: raw.notice ?? null,
  };
}
