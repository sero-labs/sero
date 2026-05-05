/**
 * @sero-ai/common — shared types and utilities for Sero packages.
 *
 * Consumed by apps/desktop, federated app modules, and plugins.
 * Must remain renderer-safe (no Node imports).
 * Keep this package limited to generic Sero platform contracts.
 */

export {
  SERO_HOST_CAPABILITIES,
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

export {
  DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
  OPENSHELL_POLICY_PROFILES,
  getDefaultOpenShellPolicyProfile,
  getOpenShellPolicyProfile,
  isOpenShellPolicyProfileId,
} from './openshell-policy';

export type {
  OpenShellPolicyProfile,
  OpenShellPolicyProfileId,
} from './openshell-policy';

export type {
  AppRuntimeStateApi,
  AppRuntimeSubagentRunParams,
  AppRuntimeSubagentResult,
  AppRuntimeSubagentsApi,
  AppRuntimeCommandResult,
  AppRuntimeRunCommandOptions,
  AppRuntimeWorkspaceRefreshResult,
  AppRuntimeWorkspaceRuntimeKind,
  AppRuntimeWorkspaceRuntimeProviderId,
  AppRuntimeWorkspaceRuntimeConfig,
  AppRuntimeWorkspaceRuntimeFallbackCode,
  AppRuntimeWorkspaceRuntimeCapabilityKey,
  AppRuntimeWorkspaceRuntimeCapabilityAuditEntry,
  AppRuntimeWorkspaceRuntimeResolution,
  AppRuntimeWorkspaceApi,
  AppRuntimeVerificationDetectOptions,
  AppRuntimeVerificationCommandResult,
  AppRuntimeVerificationResult,
  AppRuntimeVerificationApi,
  AppRuntimeWorktreeCreateResult,
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
  AppRuntimeGitApi,
  AppRuntimeDevServerScope,
  AppRuntimeDevServerStatus,
  AppRuntimeDevServer,
  AppRuntimeStartManagedDevServerOptions,
  AppRuntimeStartManagedDevServerResult,
  AppRuntimeDevServersApi,
  AppRuntimeNotificationType,
  AppRuntimeNotificationOptions,
  AppRuntimeNotificationsApi,
  AppRuntimeHost,
  AppRuntimeContext,
  AppRuntime,
  AppRuntimeModule,
} from './app-runtime-background';

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
} from './git-app';

export type {
  VcsCheckpointSource,
  VcsCheckpoint,
  VcsWorkspaceState,
  ChangeEntry,
  FileStatus,
  StatusFile,
  WorkingCopyStatus,
  FileDiffEntry,
  BookmarkRemoteStatus,
  Bookmark,
  Remote,
  OperationEntry,
  PushPreview,
  SyncResult,
  PullRequestRef,
  PullRequestState,
  PullRequestPreview,
  PullRequestDraft,
  CreatePullRequestInput,
  CreatePullRequestResult,
  VcsEvent,
} from './vcs';

export {
  parseGitHubUrl,
  normalizeGitHubRemoteUrl,
  toGitHubCloneUrl,
  extractGitHubRepoName,
  extractGitHubUrl,
  toGitHubWebUrl,
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

export type {
  PluginDevSessionStatus,
  PluginDevSessionUiMode,
  PluginDevSessionIPC,
} from './plugin-dev';

export type {
  GlobalModelConfigStateIPC,
  WorkspaceRuntimeProviderIdIPC,
  WorkspaceRuntimeConfigIPC,
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
  WorkspaceRuntimeCapabilityIPC,
  RuntimeHealthIPC,
  WorkspaceRuntimeDiagnosticsIPC,
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
  SeroEditorBridge,
  SeroWebHostBridge,
} from './admin-bridge';
