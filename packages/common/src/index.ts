/**
 * @sero-ai/common — shared types and utilities for Sero packages.
 *
 * Consumed by apps/desktop, federated app modules, and plugins.
 * Must remain renderer-safe (no Node imports).
 * Keep this package limited to generic Sero platform contracts.
 */

export { createDebouncedFn } from './debounce';
export type { DebouncedFn } from './debounce';

export { relativeTime } from './time';

export {
  SERO_HOST_CAPABILITIES,
  SERO_PLUGIN_RUNTIME_ABI,
} from './plugins';

export type {
  InstalledPlugin,
  PluginCategory,
  PluginMeta,
  PluginRegistryEntry,
  DiscoveredPlugin,
  PluginChangeEventReason,
  PluginChangeEventIPC,
  PluginProviderAuthManifest,
  PluginProviderManifest,
  SeroProviderManifest,
  SeroHostCapability,
  PluginCompatibilityIssue,
  PluginCompatibilityStatus,
} from './plugins';

export type {
  AppToolTextContent,
  AppToolImageContent,
  AppToolContentBlock,
  AppToolResult,
} from './app-tools';

export { WORKSPACE_COMMON_IGNORES } from './workspace-ignores';

export type {
  WorkspaceAccessRootKind,
  WorkspaceAccessRootRuntimeBackend,
  WorkspaceAccessRootRuntimeMode,
  WorkspaceAccessRoot,
  WorkspaceAccessRootsResult,
} from './workspace-access-roots';

export type {
  AppRuntimeStateApi,
  AppRuntimeSubagentRepair,
  AppRuntimeSubagentRunParams,
  AppRuntimeSubagentResult,
  AppRuntimeSubagentsApi,
  AppRuntimeCommandResult,
  AppRuntimeRunCommandOptions,
  AppRuntimeWorkspaceRefreshResult,
  AppRuntimeWorkspaceRuntimeKind,
  AppRuntimeWorkspaceRuntimeFallbackCode,
  AppRuntimeWorkspaceRuntimeCapabilityKey,
  AppRuntimeWorkspaceRuntimeCapabilityAuditEntry,
  AppRuntimeWorkspaceRuntimeResolution,
  AppRuntimeWorkspaceInfo,
  AppRuntimeWorkspaceApi,
  AppRuntimeVerificationDetectOptions,
  AppRuntimeVerificationCommandResult,
  AppRuntimeVerificationResult,
  AppRuntimeVerificationApi,
  AppRuntimeWorktreeCreateResult,
  AppRuntimeWorktreeCreateOptions,
  AppRuntimeWorktreeRemoveOptions,
  AppRuntimeConflictResolutionContext,
  AppRuntimeWorktreeSyncOptions,
  AppRuntimeWorktreeSyncResult,
  AppRuntimeWorkspaceSyncResult,
  AppRuntimeCreatePullRequestOptions,
  AppRuntimeCreatePullRequestResult,
  AppRuntimePullRequestMergeMethod,
  AppRuntimeMergePullRequestResult,
  AppRuntimePullRequestMergeState,
  AppRuntimePullRequestSummary,
  AppRuntimeIssueSummary,
  AppRuntimeWorkspaceStatusResult,
  AppRuntimeDirtyWorkspaceStashResult,
  AppRuntimeGitApi,
  AppRuntimeDevServerScope,
  AppRuntimeDevServerStatus,
  AppRuntimeDevServer,
  AppRuntimeStartManagedDevServerOptions,
  AppRuntimeStartManagedDevServerResult,
  AppRuntimeDevServersApi,
  AppRuntimeProviderApiKey,
  AppRuntimeCredentialsApi,
  AppRuntimeToolchainsApi,
  AppRuntimePreparedImage,
  AppRuntimeMediaApi,
  AppRuntimeActiveSession,
  AppRuntimeSessionState,
  AppRuntimeTurnStatus,
  AppRuntimeTurnResult,
  AppRuntimeSessionHost,
  AppRuntimeHost,
  AppRuntimeContext,
  AppRuntime,
  AppRuntimeModule,
} from './app-runtime-background';

export type {
  AppRuntimeNotificationType,
  AppRuntimeNotificationOptions,
  AppRuntimeNotificationChoice,
  AppRuntimeNotificationChoiceResult,
  AppRuntimeNotificationChoiceOptions,
  AppRuntimeNotificationsApi,
} from './app-runtime-notifications';

export type {
  ContextToolInfo,
  ContextSkillInfo,
  ContextAgentInfo,
  ContextOverrides,
  ContextPreset,
  AvailableContext,
  SessionContext,
} from './context-editor';

export type {
  ExtensionRuntimeTextContent,
  ExtensionRuntimeImageContent,
  ExtensionRuntimeContentBlock,
  ExtensionRuntimeContent,
  ExtensionRuntimeMessage,
  ExtensionSessionRuntime,
} from './session-runtime';

export {
  THINKING_LEVELS,
  THINKING_LABELS,
  MODEL_TIERS,
  modelKey,
  parseModelKey,
  formatModelRef,
  isThinkingLevel,
  normalizeThinkingLevel,
  isModelTier,
  findModel,
  findGroup,
  findModelByReference,
  flattenModelGroups,
  filterModelGroups,
  getAvailableThinkingLevels,
  resolveSupportedThinkingLevel,
  supportsThinkingLevel,
  getModelTierThinkingLevel,
  formatModelValidationWarning,
  validateGlobalTierSelections,
  validateAgentModelConfig,
} from './model-selection';

export type {
  ThinkingLevel,
  ModelTier,
  SharedModelInfo,
  SharedAvailableModelGroup,
  SharedModelTierEntry,
  SharedModelTierSettings,
  StructuredModelPreference,
  AgentModelPreference,
  ModelValidationWarningCode,
  ModelValidationWarning,
} from './model-selection';

export {
  SERO_SETTINGS_KEY,
  SKILL_VISIBILITY_SETTINGS_KEY,
  DISABLED_MODEL_SKILLS_KEY,
  getDisabledModelSkills,
  withDisabledModelSkills,
} from './skill-visibility';

export {
  USER_FEEDBACK_BUS_KEY,
  USER_FEEDBACK_QUESTION_REQUEST_EVENT,
  USER_FEEDBACK_QUESTION_CANCEL_EVENT,
  getGlobalSingleton,
  getUserFeedbackAnswerEvent,
} from './user-feedback';

export type {
  UserFeedbackQuestionType,
  UserFeedbackQuestionOption,
  UserFeedbackQuestionContext,
  UserFeedbackOpenTarget,
  UserFeedbackQuestionItem,
  UserFeedbackPendingQuestion,
  UserFeedbackAnswer,
  UserFeedbackResponse,
  UserFeedbackCancelPayload,
} from './user-feedback';

export type {
  GitManagerAction,
  GitManagerRequest,
  GitActionResult,
  CommitNode,
  RefLabel,
  BranchInfo,
  RemoteInfo,
  FileChangeStatus,
  FileChange,
  StashEntry,
  DiffHunk,
  DiffLine,
  FileDiff,
  GitSyncMode,
  GitAppState,
  GitMergeState,
} from './git-app';
export {
  createDefaultGitState,
  normalizeGitState,
  DEFAULT_GIT_STATE,
  BRANCH_COLORS,
} from './git-app';
export type { GitServiceBridge } from './git-service-bridge';
export { setGitServiceBridge, getGitServiceBridge } from './git-service-bridge';

export type {
  VcsCheckpointSource,
  VcsCheckpoint,
  VcsWorkspaceState,
  CommitEntry,
  FileStatus,
  StatusFile,
  WorkingCopyStatus,
  FileDiffEntry,
  GitDiffStat,
  BranchRemoteStatus,
  Branch,
  Remote,
  SyncResult,
  PullRequestRef,
  PullRequestState,
  PullRequestPreview,
  PullRequestDraft,
  CreatePullRequestInput,
  CreatePullRequestResult,
  VcsEvent,
  RemoteImportMode,
  RemoteImportOutcome,
  ConnectRemoteResult,
  PublishRepoInput,
  PublishRepoResult,
} from './vcs';

export { WORKING_TREE_REV } from './vcs';

export {
  parseGitHubUrl,
  normalizeGitHubRemoteUrl,
  toGitHubCloneUrl,
  extractGitHubRepoName,
  extractGitHubUrl,
  toGitHubWebUrl,
  deriveRepoNameFromGitUrl,
} from './github-url';

export type {
  ParsedGitHubRepo,
} from './github-url';

export type {
  WebAppAction,
  WebAppRequest,
  WebAppActionResult,
  WebAppActionSuccess,
  WebAppActionFailure,
  SeroWebAppBridge,
} from './web-app';

export type {
  CronJob,
  CronState,
} from './cron-contract';

export {
  ORCHESTRATOR_APP_ID,
  ORCHESTRATOR_INDEX_FILE,
  ORCHESTRATOR_REGISTRY_GLOBAL_KEY,
  getOrchestratorRegistry,
} from './orchestrator-contract';
export type {
  OrchestratorLoopStatus,
  OrchestratorScheduleSummary,
  OrchestratorScheduledLoopView,
  OrchestratorIndexView,
  OrchestratorSetScheduleParams,
  OrchestratorQuestionChoiceView,
  OrchestratorQuestionView,
  OrchestratorAttentionInputView,
  OrchestratorAttentionSuggestionView,
  OrchestratorAttentionView,
  OrchestratorProgressView,
  OrchestratorUsageView,
  OrchestratorPullRequestView,
  OrchestratorBoardLoopView,
  OrchestratorBoardIndexView,
  OrchestratorInputAnswerView,
  OrchestratorBoardEventView,
  OrchestratorBoardAction,
  OrchestratorBoardActionResult,
  OrchestratorCoordinatorHandle,
  OrchestratorRegistryEntryView,
} from './orchestrator-contract';

export type {
  PluginDevSessionStatus,
  PluginDevSessionUiMode,
  PluginDevSessionIPC,
} from './plugin-dev';

export type {
  AgentPluginSourceKind,
  AgentPluginDiagnosticLevel,
  AgentPluginComponentKind,
  AgentPluginDiagnostic,
  AgentPluginManifest,
  AgentPluginSkill,
  AgentPluginMcpTransport,
  AgentPluginMcpServer,
  AgentPluginCliState,
  InstalledAgentPlugin,
  AgentPluginInspection,
  AgentPluginInstallRequest,
  AgentPluginUpdateRequest,
  AgentPluginUpdatePreview,
  AgentPluginCliSettingsRequest,
  AgentPluginRemoveRequest,
  AgentPluginChangeEvent,
  AgentPluginMcpSource,
  AgentPluginMcpSourcesRequest,
  SeroAgentPluginsBridge,
} from './agent-plugins';
export { AGENT_PLUGIN_MCP_SOURCES_EVENT } from './agent-plugins';

export type {
  GlobalModelConfigStateIPC,
  WorkspaceRootIPC,
  ProfileInfo,
  SeroSessionInfo,
  AvailableSkillInfo,
  StructuredAgentModelIPC,
  AgentModelIPC,
  AgentSummaryIPC,
  AgentFileDataIPC,
  SkillSummaryIPC,
  SkillFileDataIPC,
  PromptTemplateSummaryIPC,
  PromptTemplateFileDataIPC,
  ModelInfoIPC,
  AvailableModelGroupIPC,
  OAuthProviderInfoIPC,
  ApiKeyProviderInfoIPC,
  AuthProvidersResponseIPC,
  OAuthEventIPC,
  ProviderHealthStatusIPC,
  ProviderHealthInfoIPC,
  OnboardingContainerRuntimeIPC,
  OnboardingStateIPC,
  WorkspaceInfoIPC,
  RuntimeCapabilitiesIPC,
  RuntimeCapabilityInstallStateIPC,
  RuntimeCapabilityStateIPC,
  WorkspaceRuntimeCapabilityIPC,
  WorkspaceRuntimeDiagnosticsIPC,
  RuntimeInstallErrorIPC,
  ManagedToolStatusIPC,
  ToolchainProgressIPC,
  ToolchainStatusIPC,
  BrowserPackProgressIPC,
  BrowserPackStatusIPC,
  ContainerInfoIPC,
  SeroAppStateBridge,
  SeroAppsBridge,
  SeroShellBridge,
  SeroWorkspaceBridge,
  SeroPluginsBridge,
  SeroAuthBridge,
  SeroSubagentBridge,
  SeroSkillsBridge,
  SeroPromptsBridge,
  SeroModelConfigBridge,
  SeroModelsBridge,
  SeroOnboardingBridge,
  SeroUserFeedbackBridge,
  SeroProfilesBridge,
  SeroSessionsBridge,
  SeroAdminBridge,
  SeroAppControlBridge,
  SeroCaptureRect,
  SeroEditorBridge,
  SeroWebHostBridge,
} from './admin-bridge';

export {
  AUTO_EDITOR_THEME_ID,
  SHIKI_THEME_PAIRS,
  resolveShikiThemePair,
} from './editor-themes';

export type { ShikiThemeName, ShikiThemePair } from './editor-themes';
