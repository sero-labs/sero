import type {
  CreateGitHubRepoInput,
  CreateGitHubRepoResult,
  LocalModelsConfig,
  LocalModelsSaveResult,
  LocalModelsConnectionRequest,
  LocalRemoteModelInfo,
  QrLoginData,
} from './ipc';

export interface SeroGatewayAPI {
  /**
   * Generate a QR code for device pairing.
   * Creates a time-limited owner web token with access to the whole profile and returns the QR data URL + login URL.
   * @param expiryDays Number of days until the token expires (default 7).
   */
  getQrLoginData(expiryDays?: number): Promise<QrLoginData>;
}

export interface SeroLocalModelsAPI {
  /** Read the current models.json config. Returns empty config if file doesn't exist. */
  getConfig(): Promise<LocalModelsConfig>;
  /** Write the full models.json config to disk and refresh the model registry. */
  saveConfig(config: LocalModelsConfig): Promise<LocalModelsSaveResult>;
  /** Test connectivity to a local provider using its selected API + auth settings. */
  testConnection(request: LocalModelsConnectionRequest): Promise<{ ok: boolean; error?: string }>;
  /** Fetch available models from a provider's API (OpenAI, Anthropic, Google, Ollama). */
  fetchRemoteModels(request: LocalModelsConnectionRequest): Promise<LocalRemoteModelInfo[]>;
}

export interface SeroPluginConfigAPI {
  /** Read a plugin's config. Returns null if not found. */
  read(pluginId: string): Promise<Record<string, unknown> | null>;
  /** Write a plugin's config. Returns success. */
  write(pluginId: string, config: Record<string, unknown>): Promise<{ ok: boolean }>;
}

export interface GitHubAuthStatus {
  authenticated: boolean;
  username?: string;
  scopes?: string;
}

export interface GitHubDeviceFlowEvent {
  type: 'code' | 'polling' | 'success' | 'error';
  userCode?: string;
  verificationUri?: string;
  message?: string;
  username?: string;
}

export interface SeroGitHubAPI {
  status(): Promise<GitHubAuthStatus>;
  login(): Promise<void>;
  logout(): Promise<void>;
  cancel(): Promise<void>;
  onEvent(callback: (event: GitHubDeviceFlowEvent) => void): () => void;
  /** Create a GitHub repository for a workspace. */
  createRepo(workspaceId: string, input: CreateGitHubRepoInput): Promise<CreateGitHubRepoResult>;
}
