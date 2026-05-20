/**
 * Typed access to the Admin-consumed `window.sero` bridge.
 *
 * All host-boundary access goes through `getSero()` so the bridge contract stays
 * centralized and easy to update.
 */

import type { SeroAdminBridge } from '@sero-ai/common';

export type {
  AgentFileDataIPC,
  AgentModelIPC,
  AgentSummaryIPC,
  ApiKeyProviderInfoIPC,
  AuthProvidersResponseIPC,
  AvailableModelGroupIPC,
  AvailableSkillInfo,
  GlobalModelConfigStateIPC,
  ModelInfoIPC,
  OAuthEventIPC,
  OAuthProviderInfoIPC,
  OnboardingContainerRuntimeIPC,
  OnboardingStateIPC,
  PluginChangeEventIPC,
  PluginChangeEventReason,
  PluginDevSessionIPC,
  PluginDevSessionStatus,
  PluginDevSessionUiMode,
  ProfileInfo,
  PromptTemplateFileDataIPC,
  PromptTemplateSummaryIPC,
  ProviderHealthInfoIPC,
  ContainerInfoIPC,
  WorkspaceInfoIPC,
  RuntimeInstallErrorIPC,
  ManagedToolStatusIPC,
  ToolchainProgressIPC,
  ToolchainStatusIPC,
  BrowserPackProgressIPC,
  BrowserPackStatusIPC,
  RuntimeCapabilitiesIPC,
  RuntimeCapabilityInstallStateIPC,
  RuntimeCapabilityStateIPC,
  WorkspaceRuntimeCapabilityIPC,
  WorkspaceRuntimeDiagnosticsIPC,
  ProviderHealthStatusIPC,
  SeroSessionInfo,
  SkillFileDataIPC,
  SkillSummaryIPC,
  StructuredAgentModelIPC,
  WorkspaceRootIPC,
} from '@sero-ai/common';

/** Single typed access point for the renderer host bridge. */
export function getSero(): SeroAdminBridge {
  const sero = (window as Window & { sero?: SeroAdminBridge }).sero;
  if (!sero) {
    throw new Error('Sero admin bridge is unavailable');
  }
  return sero;
}
