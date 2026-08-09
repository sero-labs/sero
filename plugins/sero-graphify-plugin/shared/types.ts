export type GraphifyBackend = 'claude' | 'openai' | 'gemini' | 'deepseek' | 'kimi' | 'ollama';

export interface AutoContextSettings {
  sessionSummary: boolean;
  augmentSearchResults: boolean;
  autoQuery: boolean;
  maxSessionAugments: number;
  maxAugmentChars: number;
}

export interface GraphifySettings {
  backend: GraphifyBackend;
  /** Model override passed as --model; '' = the backend's default model. */
  model: string;
  /** Per-build LLM token cap passed as --token-budget; 0 = graphify default. */
  tokenBudget: number;
  /** Glob patterns passed as repeated --exclude flags. */
  exclude: string[];
  autoContext: AutoContextSettings;
}

export interface WorkspaceIndexStats {
  nodes: number;
  edges: number;
  communities: number;
  inputTokens: number;
  outputTokens: number;
}

export type WorkspaceIndexStatus = 'idle' | 'queued' | 'building' | 'updating' | 'error';

export interface WorkspaceIndexEntry {
  workspaceId: string;
  name: string;
  path: string;
  enabled: boolean;
  status: WorkspaceIndexStatus;
  lastBuiltAt?: string;
  lastError?: string;
  stats?: WorkspaceIndexStats;
  /** Latest build progress line; only set while building/updating. */
  progress?: string;
}

export type IndexAction = 'enable' | 'disable' | 'rebuild' | 'refresh' | 'enable-all' | 'sync';

export interface IndexRequest {
  id: number;
  action: IndexAction;
  workspaceId?: string;
  workspaceName?: string;
  workspacePath?: string;
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
}

export interface ProfileGraphState {
  status: 'absent' | 'merging' | 'ready' | 'failed';
  mergedAt?: string;
  nodes?: number;
  edges?: number;
  workspaceIds?: string[];
  error?: string;
}

export interface GraphifyState {
  settings: GraphifySettings;
  provisioning: ProvisioningState;
  /** Keyed by workspaceId. */
  workspaces: Record<string, WorkspaceIndexEntry>;
  /** Appended by extension/UI, drained by the host runtime. */
  requests: IndexRequest[];
  nextRequestId: number;
  profileGraph: ProfileGraphState;
}

export const DEFAULT_STATE: GraphifyState = Object.freeze({
  settings: {
    backend: 'claude',
    model: '',
    tokenBudget: 0,
    exclude: ['node_modules', 'dist', 'build', 'out', '.git', '*.lock', '*.min.js', '*.map'],
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
  profileGraph: { status: 'absent' },
}) as GraphifyState;
