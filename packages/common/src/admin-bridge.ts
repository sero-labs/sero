import type {
  OpenShellPolicyProfile,
  OpenShellPolicyProfileHistoryEntry,
  OpenShellPolicyProfileId,
} from './openshell-policy';
import type { ThinkingLevel, ModelValidationWarning } from './model-selection';
import type { PluginDevSessionIPC } from './plugin-dev';
import type { InstalledPlugin, PluginChangeEventIPC } from './plugins';
import type {
  UserFeedbackPendingQuestion,
  UserFeedbackResponse,
  UserFeedbackCancelPayload,
} from './user-feedback';
import type { SeroWebAppBridge } from './web-app';

export interface GlobalModelConfigStateIPC {
  tiers: Partial<Record<'LOW' | 'MED' | 'HIGH', {
    provider: string;
    modelId: string;
    thinkingLevel?: ThinkingLevel;
  }>>;
  warnings: ModelValidationWarning[];
  migrationNotice?: string;
}

export type WorkspaceRuntimeProviderIdIPC = 'host' | 'apple-container' | 'openshell-local' | 'openshell-remote';

export type WorkspaceRuntimePolicyHistoryEntryIPC = OpenShellPolicyProfileHistoryEntry;

export interface WorkspaceRuntimeConfigIPC {
  providerId: WorkspaceRuntimeProviderIdIPC;
  gatewayName?: string;
  sandboxName?: string;
  runtimeWorkspacePath?: string;
  experimental?: boolean;
  remoteGatewayId?: string;
  policyProfileId?: OpenShellPolicyProfileId;
  policyProfileUpdatedAt?: string;
  policyProfileHistory?: WorkspaceRuntimePolicyHistoryEntryIPC[];
}

export interface WorkspaceRootIPC {
  id: string;
  name: string;
  path: string;
  kind?: 'folder' | 'linked-plugin';
}

export interface ProfileInfo {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  isActive: boolean;
}

export interface SeroSessionInfo {
  id: string;
  path: string;
  name?: string;
  created: string;
  modified: string;
  workspaceId: string;
  messageCount: number;
  firstMessage: string;
}

export interface AvailableSkillInfo {
  name: string;
  description: string;
  source: string;
  disableModelInvocation: boolean;
}

export interface StructuredAgentModelIPC {
  prefer: string;
  fallbacks: string[];
}

export type AgentModelIPC = string | StructuredAgentModelIPC;

export interface AgentSummaryIPC {
  name: string;
  description: string;
  model?: AgentModelIPC;
  thinking?: string;
  timeoutMs?: number;
}

export interface AgentFileDataIPC {
  name: string;
  description: string;
  model?: AgentModelIPC;
  thinking?: string;
  timeoutMs?: number;
  tools?: string[];
  systemPrompt: string;
}

export interface SkillSummaryIPC {
  name: string;
  description: string;
  filePath: string;
  source: 'user' | 'project' | 'path';
}

export interface SkillFileDataIPC {
  name: string;
  description: string;
  extraFrontmatter: Record<string, unknown>;
  filePath?: string;
  body: string;
}

export interface PromptTemplateSummaryIPC {
  name: string;
  description: string;
  filePath: string;
  relativePath: string;
}

export interface PromptTemplateFileDataIPC {
  name: string;
  description: string;
  filePath?: string;
  body: string;
}

export interface ModelInfoIPC {
  provider: string;
  modelId: string;
  name: string;
  reasoning: boolean;
  availableThinkingLevels?: ThinkingLevel[];
  supportsXhigh?: boolean;
}

export interface AvailableModelGroupIPC {
  provider: string;
  displayName: string;
  logo: string;
  models: ModelInfoIPC[];
}

export interface OAuthProviderInfoIPC {
  id: string;
  name: string;
  isLoggedIn: boolean;
  canRefresh: boolean;
}

export interface ApiKeyProviderInfoIPC {
  id: string;
  name: string;
  hasKey: boolean;
  fromEnv: boolean;
}

export interface AuthProvidersResponseIPC {
  oauth: OAuthProviderInfoIPC[];
  apiKey: ApiKeyProviderInfoIPC[];
}

export interface OAuthEventIPC {
  type: 'auth' | 'prompt' | 'manual_input' | 'waiting' | 'progress' | 'success' | 'error' | 'cancelled';
}

export type ProviderHealthStatusIPC =
  | 'healthy'
  | 'broken_expired'
  | 'broken_invalid'
  | 'env'
  | 'local'
  | 'missing'
  | 'unknown';

export interface ProviderHealthInfoIPC {
  providerId: string;
  displayName: string;
  status: ProviderHealthStatusIPC;
  message?: string;
  canReconnect: boolean;
  hasUsableModels: boolean;
  usableModelIds: string[];
}

export interface OnboardingContainerRuntimeIPC {
  status: 'available' | 'missing_binary' | 'system_unavailable' | 'startup_failed';
  message: string;
  recommended: boolean;
  docsUrl?: string;
}

export interface OnboardingStateIPC {
  providerHealth: ProviderHealthInfoIPC[];
  availableModelGroups: AvailableModelGroupIPC[];
  containerRuntime: OnboardingContainerRuntimeIPC;
}

export interface SeroAppStateBridge {
  read(filePath: string): Promise<unknown>;
  readText(filePath: string): Promise<string | null>;
  write(filePath: string, data: unknown): Promise<void>;
}

export interface SeroAppsBridge {
  discover(): Promise<Array<{ id: string; name: string }>>;
}

export interface SeroShellBridge {
  showItemInFolder(path: string): Promise<void>;
  openExternal?(url: string): Promise<void>;
}

export interface WorkspaceInfoIPC {
  id: string;
  name: string;
  path: string;
  container: boolean;
  runtime?: WorkspaceRuntimeConfigIPC;
  references: string[];
  mounts: string[];
  roots: WorkspaceRootIPC[];
}

export interface WorkspaceRuntimeCapabilityIPC {
  key: 'browserAutomation' | 'containerizedLanguageServers' | 'managedDevServers' | 'containerMounts';
  label: string;
  available: boolean;
  containerOnly: boolean;
  detail: string;
}

export interface RuntimeHealthIPC {
  providerId: WorkspaceRuntimeProviderIdIPC;
  status: 'ready' | 'fallback' | 'unavailable';
  message?: string;
}

export interface OpenShellPolicyOutputIPC {
  available: boolean;
  summary: string;
}

export interface OpenShellPolicyBlockedEventIPC {
  source: 'openshell-logs';
  line: string;
  matchedTerms: string[];
  bestEffort: true;
}

export interface OpenShellRemoteGatewayEntryIPC {
  id: string;
  name: string;
  sshHost: string;
  sshKeyPath?: string;
  port: number;
  gatewayHost?: string;
  createdAt: string;
  updatedAt: string;
}

export type OpenShellRemoteGatewayInputIPC = Omit<
  OpenShellRemoteGatewayEntryIPC,
  'createdAt' | 'updatedAt'
>;

export interface OpenShellRemoteDiagnosticsIPC {
  gatewayId?: string;
  gatewayName?: string;
  sshHost?: string;
  sandboxName?: string;
  latencyMs?: number;
  status: 'ready' | 'unavailable' | 'unsupported';
  message: string;
}

export interface OpenShellPolicyDiagnosticsIPC {
  selectedProfile: OpenShellPolicyProfile;
  enforcementStatus: 'profile-preview-only';
  enforcementMessage: string;
  activePolicy: OpenShellPolicyOutputIPC;
  policyList: OpenShellPolicyOutputIPC;
  logSummary: OpenShellPolicyOutputIPC;
  blockedEvents: OpenShellPolicyBlockedEventIPC[];
  allowDenyPromptsSupported: false;
  allowDenyPromptsMessage: string;
}

export interface WorkspaceRuntimeDiagnosticsIPC {
  workspaceId: string;
  workspacePath: string;
  desiredRuntime: 'container' | 'host' | 'openshell-local' | 'openshell-remote';
  actualRuntime: 'container' | 'host' | 'openshell-local' | 'openshell-remote';
  containerEnabled: boolean;
  fallbackCode?: 'container_unavailable';
  fallbackReason?: string;
  capabilityAudit: WorkspaceRuntimeCapabilityIPC[];
  providerId?: WorkspaceRuntimeProviderIdIPC;
  runtimeConfig?: WorkspaceRuntimeConfigIPC;
  runtimeHealth?: RuntimeHealthIPC;
  openShellPolicy?: OpenShellPolicyDiagnosticsIPC;
  openShellRemote?: OpenShellRemoteDiagnosticsIPC;
}

export interface ContainerInfoIPC {
  id: string;
  image: string;
  state: 'running' | 'stopped';
  ipAddress?: string;
  cpus: number;
  memoryBytes: number;
}

export interface SeroWorkspaceBridge {
  list?(): Promise<WorkspaceInfoIPC[]>;
  getRuntimeDiagnostics?(workspaceId?: string): Promise<WorkspaceRuntimeDiagnosticsIPC[]>;
  listOpenShellRemoteGateways?(): Promise<OpenShellRemoteGatewayEntryIPC[]>;
  saveOpenShellRemoteGateway?(entry: OpenShellRemoteGatewayInputIPC): Promise<OpenShellRemoteGatewayEntryIPC>;
  removeOpenShellRemoteGateway?(id: string): Promise<void>;
  testOpenShellRemoteGateway?(entry: OpenShellRemoteGatewayInputIPC): Promise<OpenShellRemoteDiagnosticsIPC>;
  pickFolder(): Promise<string | null>;
  listRoots(workspaceId: string): Promise<WorkspaceRootIPC[]>;
  addRoot(
    workspaceId: string,
    input: { name: string; path: string; kind?: WorkspaceRootIPC['kind'] },
  ): Promise<WorkspaceRootIPC>;
  removeRoot(workspaceId: string, rootId: string): Promise<void>;
  renameRoot(workspaceId: string, rootId: string, newName: string): Promise<void>;
}

export interface SeroPluginsBridge {
  list(): Promise<InstalledPlugin[]>;
  install(source: string): Promise<{ id: string; name: string }>;
  uninstall(pluginId: string): Promise<void>;
  listDevSessions(): Promise<PluginDevSessionIPC[]>;
  startDevSession(sourcePath?: string): Promise<PluginDevSessionIPC | null>;
  refreshDevSession(sessionId: string): Promise<PluginDevSessionIPC>;
  stopDevSession(sessionId: string): Promise<void>;
  onChanged(callback: (event: PluginChangeEventIPC) => void): () => void;
}

export interface SeroAuthBridge {
  onEvent(callback: (event: OAuthEventIPC) => void): () => void;
  getProviders(): Promise<AuthProvidersResponseIPC>;
  login(providerId: string): Promise<void>;
}

export interface SeroSubagentBridge {
  listAgents(): Promise<AgentSummaryIPC[]>;
  readAgent(name: string): Promise<AgentFileDataIPC>;
  writeAgent(data: AgentFileDataIPC): Promise<void>;
  deleteAgent(name: string): Promise<void>;
}

export interface SeroSkillsBridge {
  listAvailableSkills(): Promise<AvailableSkillInfo[]>;
  setDisabledModelSkills(skillNames: string[]): Promise<void>;
  listSkills(): Promise<SkillSummaryIPC[]>;
  readSkill(filePath: string): Promise<SkillFileDataIPC>;
  writeSkill(data: SkillFileDataIPC): Promise<string>;
  deleteSkill(filePath: string): Promise<void>;
}

export interface SeroPromptsBridge {
  listPrompts(): Promise<PromptTemplateSummaryIPC[]>;
  readPrompt(filePath: string): Promise<PromptTemplateFileDataIPC>;
  writePrompt(data: PromptTemplateFileDataIPC): Promise<string>;
  deletePrompt(filePath: string): Promise<void>;
}

export interface SeroModelConfigBridge {
  get(): Promise<GlobalModelConfigStateIPC>;
  set(config: {
    tiers: Partial<Record<'LOW' | 'MED' | 'HIGH', {
      provider: string;
      modelId: string;
      thinkingLevel?: ThinkingLevel;
    }>>;
  }): Promise<GlobalModelConfigStateIPC>;
}

export interface SeroModelsBridge {
  list(): Promise<AvailableModelGroupIPC[]>;
}

export interface SeroOnboardingBridge {
  getState(): Promise<OnboardingStateIPC>;
}

export interface SeroContainerBridge {
  status(workspaceId: string): Promise<ContainerInfoIPC | null>;
}

export interface SeroUserFeedbackBridge {
  getPending(): Promise<UserFeedbackPendingQuestion[]>;
  answer(response: UserFeedbackResponse): Promise<void>;
  onQuestion(callback: (data: UserFeedbackPendingQuestion) => void): () => void;
  onCancel(callback: (data: UserFeedbackCancelPayload) => void): () => void;
}

export interface SeroProfilesBridge {
  list(): Promise<ProfileInfo[]>;
  getActive(): Promise<ProfileInfo | null>;
}

export interface SeroSessionsBridge {
  list(): Promise<SeroSessionInfo[]>;
}

export interface SeroAdminBridge {
  appState: SeroAppStateBridge;
  profiles: SeroProfilesBridge;
  sessions: SeroSessionsBridge;
  apps: SeroAppsBridge;
  shell: SeroShellBridge;
  workspace: SeroWorkspaceBridge;
  plugins: SeroPluginsBridge;
  auth: SeroAuthBridge;
  subagent: SeroSubagentBridge;
  skills: SeroSkillsBridge;
  prompts: SeroPromptsBridge;
  modelConfig: SeroModelConfigBridge;
  models: SeroModelsBridge;
  onboarding: SeroOnboardingBridge;
  container?: SeroContainerBridge;
}

export interface SeroAppControlBridge {
  openFile(workspaceId: string, filePath: string): Promise<boolean>;
}

export interface SeroEditorBridge {
  delete(workspaceId: string, itemPath: string): Promise<boolean>;
}

export interface SeroWebHostBridge {
  appControl?: Partial<SeroAppControlBridge>;
  shell?: Partial<SeroShellBridge>;
  editor?: Partial<SeroEditorBridge>;
  webApp?: Partial<SeroWebAppBridge>;
}
