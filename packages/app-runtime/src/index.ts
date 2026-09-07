/**
 * @sero-ai/app-runtime — hooks for Sero federated app modules.
 *
 * Shared via module federation so every app gets the host's singleton.
 * Hooks communicate with the Electron main process via window.sero IPC.
 */

export {
  AppContext,
  AppProvider,
  type AppContextValue,
  type AppNavigationValue,
  type AppProfilePreferencesValue,
  type AppProfilePreferenceValue,
  type AppContributionSlotsValue,
  type ContributedComponentDescriptor,
  type ContributionMountOptions,
} from './context';
export {
  useAppContributionSlot,
  type UseAppContributionSlotResult,
} from './use-app-contribution-slot';
export { useAppState } from './use-app-state';
export { useAppNavigation } from './use-app-navigation';
export { useAppPreferences } from './use-app-preferences';
export { useAppInfo } from './use-app-info';
export { useAgentPrompt } from './use-agent-prompt';
export { useAI, type AppAI } from './use-ai';
export { useAppTools, type AppTools } from './use-app-tools';
export { useAvailableModels, type UseAvailableModelsResult } from './use-available-models';
export { useSubagentContext, type UseSubagentContextResult } from './use-subagent-context';
export { useContextPresets, type UseContextPresetsResult } from './use-context-presets';
export { useTheme, type UseThemeResult } from './use-theme';
export { getSeroApi } from './sero-bridge';
export {
  openSeroApp,
  openSeroFile,
  closeSeroSearch,
  SERO_GLOBAL_SEARCH_CLOSE_EVENT,
  consumeAppLaunchParams,
  onAppLaunchParams,
} from './app-launch';
export type { AppModelInfo, AppModelGroup, SeroWorkspaceBridge, SeroWorkspaceCreateOptions, SeroWorkspaceInfo } from './sero-bridge';
export type { AppToolContentBlock, AppToolImageContent, AppToolResult, AppToolTextContent } from '@sero-ai/common';
export { registerWidget, getRuntimeWidgets, onWidgetRegistryChange } from './widget-registry';
export type { RuntimeWidget } from './widget-registry';
export { useWidgetRegistration } from './use-widget-registration';
