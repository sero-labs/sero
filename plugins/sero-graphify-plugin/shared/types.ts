export type GraphifyBackend =
  | 'claude'
  | 'claude-cli'
  | 'openai'
  | 'gemini'
  | 'deepseek'
  | 'kimi'
  | 'azure'
  | 'bedrock'
  | 'ollama';

/**
 * The backend and model every paid pass runs on.
 *
 * There is deliberately no "backend default" option. graphify picks its own
 * model when none is given, which is how a build could run without anyone
 * being able to say what it cost. `null` on the settings means "not chosen
 * yet", and no paid work runs while it is null.
 */
export interface ModelChoice {
  backend: GraphifyBackend;
  /** Exact model id passed to the CLI, e.g. 'gpt-5.6-luna'. Never empty. */
  modelId: string;
  chosenAt: string;
  /**
   * USD per 1M tokens, when the user knows the price of a model Sero does not.
   * Model prices change and new models appear constantly, so a built-in table
   * can only ever be a starting point — without this, a correct estimate would
   * need a Sero release.
   */
  price?: ModelPrice;
}

/** USD per 1,000,000 tokens. */
export interface ModelPrice {
  input: number;
  output: number;
}

export interface AutoContextSettings {
  sessionSummary: boolean;
  augmentSearchResults: boolean;
  autoQuery: boolean;
  maxSessionAugments: number;
  maxAugmentChars: number;
}

/** Hard ceilings enforced by the indexer before it spends. */
export interface SpendCaps {
  /** A build whose estimate exceeds this is refused, not silently trimmed. */
  maxCostPerBuildUsd: number;
  /** Profile-wide daily ceiling, measured against the ledger. */
  maxCostPerDayUsd: number;
  maxFilesPerBuild: number;
}

export interface GraphifySettings {
  /** Null until the user chooses. No paid build runs while it is null. */
  model: ModelChoice | null;
  /**
   * Per-chunk packing size passed as `--token-budget` (graphify default
   * 60000). This is NOT a spend cap — a larger value spends more per call,
   * not less. The caps are in `caps`. 0 = leave graphify's default alone.
   */
  tokenBudget: number;
  /** Glob patterns passed as repeated --exclude flags. */
  exclude: string[];
  caps: SpendCaps;
  /** Passed as --max-concurrency; 0 = graphify default. */
  maxConcurrency: number;
  /**
   * LLM community naming — a second paid pass over the built graph. Off by
   * default: a graph is useful with `Community N` placeholders, and the pass
   * costs real money.
   */
  nameCommunities: boolean;
  /** Blocks every paid job while true and empties the queue. */
  paused: boolean;
  autoContext: AutoContextSettings;
}

export interface WorkspaceIndexStats {
  nodes: number;
  edges: number;
  communities: number;
  inputTokens: number;
  outputTokens: number;
  /** Reported cost of the build that produced these numbers. */
  costUsd?: number;
  /** The model that produced this graph, so an old build stays explainable. */
  model?: string;
  backend?: GraphifyBackend;
  /** graphifyy version that produced it — a pin bump makes rebuilds explainable. */
  graphifyVersion?: string;
}

export type WorkspaceIndexStatus =
  | 'idle'
  | 'queued'
  | 'building'
  | 'updating'
  | 'error'
  /** Enabled, but no graph on disk. Waits for the user — a restart never spends. */
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
  /** Latest build progress line; only set while building/updating. */
  progress?: string;
  /** Last time any job ran for this workspace, successful or not. */
  lastAttemptAt?: string;
  /** Last time a job that could spend money ran. */
  lastPaidAttemptAt?: string;
  /** Consecutive failures. Never triggers an automatic retry; it is evidence. */
  failureCount?: number;
}

/** What a build would cost, computed before anything is spent. */
export interface BuildEstimate {
  files: number;
  bytes: number;
  /** True when the scan stopped at the file cap — the real tree is larger. */
  truncated: boolean;
  estimatedInputTokens: number;
  /** Null when no price is known for the chosen model — never guess. */
  estimatedCostUsd: number | null;
}

export interface SpendRun {
  workspaceId: string;
  backend: GraphifyBackend;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  at: string;
}

/** Durable spend record, so a cap survives a restart and the panel can show it. */
export interface SpendLedger {
  /** UTC day (YYYY-MM-DD) that `usd` covers. */
  day: string;
  usd: number;
  runs: SpendRun[];
}

/**
 * A workspace that vanished after its graph was paid for. Kept so the cost is
 * never deleted silently along with the artifacts.
 */
export interface RemovedWorkspaceRecord {
  workspaceId: string;
  name: string;
  removedAt: string;
  stats?: WorkspaceIndexStats;
}

export type IndexAction = 'enable' | 'disable' | 'rebuild' | 'refresh' | 'enable-all' | 'sync' | 'upgrade';

export interface IndexRequest {
  id: number;
  action: IndexAction;
  workspaceId?: string;
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
  /** Newer graphifyy seen on PyPI. Upgrading is always a user action. */
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

/** A message the user must see — a refused build, a cap that stopped the queue. */
export interface GraphifyNotice {
  message: string;
  at: string;
  kind: 'cap' | 'declined' | 'refused' | 'info';
}

export interface GraphifyState {
  settings: GraphifySettings;
  provisioning: ProvisioningState;
  /** Keyed by workspaceId. */
  workspaces: Record<string, WorkspaceIndexEntry>;
  /** Appended by extension/UI, drained by the host runtime. */
  requests: IndexRequest[];
  nextRequestId: number;
  /** Highest request id already applied. Guards against a repeated delivery. */
  lastAppliedRequestId: number;
  profileGraph: ProfileGraphState;
  spend: SpendLedger;
  removedWorkspaces: RemovedWorkspaceRecord[];
  notice: GraphifyNotice | null;
  /** Model ids offered by the host, cached for the panel's picker. */
  availableModels: { backend: GraphifyBackend; modelId: string; label: string }[];
}

export const DEFAULT_CAPS: SpendCaps = Object.freeze({
  maxCostPerBuildUsd: 2,
  maxCostPerDayUsd: 10,
  maxFilesPerBuild: 5000,
});

export const DEFAULT_STATE: GraphifyState = Object.freeze({
  settings: {
    model: null,
    tokenBudget: 0,
    exclude: ['node_modules', 'dist', 'build', 'out', '.git', '*.lock', '*.min.js', '*.map'],
    caps: DEFAULT_CAPS,
    maxConcurrency: 0,
    nameCommunities: false,
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
  spend: { day: '', usd: 0, runs: [] },
  removedWorkspaces: [],
  notice: null,
  availableModels: [],
}) as GraphifyState;

/**
 * The global workspace is the memory store (MEMORY.md, USER.md, and the
 * append-only daily logs). It is dense prose, it grows every day, and graphify
 * chunks by tokens rather than by file count — so indexing it costs far more
 * than its file count suggests. Excluded everywhere money is spent, not only
 * in discovery.
 */
export function isIndexableWorkspace(workspaceId: string): boolean {
  return workspaceId !== 'global';
}

/**
 * Fill in anything a state file written by an older build is missing.
 *
 * State on disk predates the spend caps, the ledger and the model choice, and
 * `settings.model` used to be a plain string (`''` meaning "let graphify
 * decide"). Reading such a file without this would either crash on a missing
 * `caps` or, worse, treat a leftover model string as a valid choice and spend
 * on it. An unrecognised model value becomes `null`, which blocks paid work
 * until the user picks one.
 */
export function withStateDefaults(raw: GraphifyState | null | undefined): GraphifyState {
  const defaults = structuredClone(DEFAULT_STATE);
  if (!raw) return defaults;
  const settings = raw.settings ?? defaults.settings;
  return {
    ...defaults,
    ...raw,
    settings: {
      ...defaults.settings,
      ...settings,
      caps: { ...defaults.settings.caps, ...settings.caps },
      autoContext: { ...defaults.settings.autoContext, ...settings.autoContext },
      model: isModelChoice(settings.model) ? settings.model : null,
    },
    provisioning: { ...defaults.provisioning, ...raw.provisioning },
    profileGraph: { ...defaults.profileGraph, ...raw.profileGraph },
    spend: { ...defaults.spend, ...raw.spend },
    workspaces: raw.workspaces ?? {},
    requests: raw.requests ?? [],
    removedWorkspaces: raw.removedWorkspaces ?? [],
    availableModels: raw.availableModels ?? [],
    notice: raw.notice ?? null,
    lastAppliedRequestId: raw.lastAppliedRequestId ?? 0,
    nextRequestId: raw.nextRequestId ?? 1,
  };
}

function isModelChoice(value: unknown): value is ModelChoice {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ModelChoice>;
  return typeof candidate.modelId === 'string' && candidate.modelId.length > 0 && typeof candidate.backend === 'string';
}
