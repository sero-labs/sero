/**
 * @sero/common — shared types and utilities for Sero packages.
 *
 * Consumed by apps/desktop, federated app modules, and plugins.
 * Must remain renderer-safe (no Node imports).
 */

export type {
  InstalledPlugin,
  PluginCategory,
  PluginMeta,
  PluginRegistryEntry,
  DiscoveredPlugin,
} from './plugins';

export type {
  ExtensionRuntimeTextContent,
  ExtensionRuntimeImageContent,
  ExtensionRuntimeContentBlock,
  ExtensionRuntimeContent,
  ExtensionRuntimeMessage,
  ExtensionSessionRuntime,
} from './session-runtime';

export {
  COLUMNS,
  COLUMN_LABELS,
  PRIORITY_ORDER,
  DEFAULT_KANBAN_STATE,
  createDefaultKanbanState,
  createCard,
  validateCardTransition,
  validateReviewDecision,
  getUnmetDependencies,
  getManualMoveTargets,
  validateManualMove,
} from './kanban';

export type {
  Column,
  Priority,
  CardStatus,
  ReviewMode,
  Subtask,
  PlanningToolEntry,
  PlanningProgress,
  ImplementationProgress,
  ReviewProgress,
  Card,
  KanbanSettings,
  KanbanState,
  ValidationResult,
} from './kanban';

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
  inferSupportsXhigh,
  getAvailableThinkingLevels,
  resolveSupportedThinkingLevel,
  supportsThinkingLevel,
  getModelTierThinkingLevel,
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
