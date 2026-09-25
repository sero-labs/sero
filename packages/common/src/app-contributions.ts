/** Host-owned locations that accept federated plugin components. */
export type ComponentExtensionPointId =
  | 'ui.global-search.panel'
  | 'ui.explorer.view'
  | 'ui.titlebar.control'
  | 'ui.chat.model-extension'
  | 'ui.chat.tool-result'
  | 'ui.admin.model-settings'
  | 'ui.dashboard.widget';

/** Host-owned locations that accept host-rendered plugin controls. */
export type ControlExtensionPointId = 'workspace.create.option';

export type AppExtensionPointId = ComponentExtensionPointId | ControlExtensionPointId;

export interface ComponentContributionBase {
  id: string;
  extensionPoint: ComponentExtensionPointId;
  component: string;
}

export interface GlobalSearchPanelContribution extends ComponentContributionBase {
  extensionPoint: 'ui.global-search.panel';
  description?: string;
}

export interface ExplorerViewContribution extends ComponentContributionBase {
  extensionPoint: 'ui.explorer.view';
  label?: string;
  icon?: string;
}

export interface TitleBarControlContribution extends ComponentContributionBase {
  extensionPoint: 'ui.titlebar.control';
}

export interface ChatModelExtensionContribution extends ComponentContributionBase {
  extensionPoint: 'ui.chat.model-extension';
  models: Array<{ provider: string; api: string; modelId: string }>;
}

/**
 * A view of a tool result in the chat tool-call details. Sero mounts it only
 * for a result whose `details` carry a matching `seroToolResultView` marker.
 */
export interface ChatToolResultContribution extends ComponentContributionBase {
  extensionPoint: 'ui.chat.tool-result';
}

/** Put this in a tool result's `details` to show the named `ui.chat.tool-result` component with the result. */
export interface SeroToolResultViewMarker {
  appId: string;
  contributionId: string;
}

/** The props that Sero gives a `ui.chat.tool-result` component. */
export interface ChatToolResultViewProps {
  sessionId: string;
  toolCallId: string;
  details: Record<string, unknown>;
  isError: boolean;
}

export interface AdminModelSettingsContribution extends ComponentContributionBase {
  extensionPoint: 'ui.admin.model-settings';
  name: string;
  description?: string;
  icon?: string;
}

export interface DashboardWidgetContribution extends ComponentContributionBase {
  extensionPoint: 'ui.dashboard.widget';
  name: string;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  maxSize?: { w: number; h: number };
  description?: string;
  /**
   * Opt in to being shown in web-remote.
   *
   * A remote widget runs in a browser with no preload bridge, so only the
   * remote-safe part of `window.sero` is there. Most widgets assume the
   * full bridge, which is why this is opt-in rather than the default.
   */
  remote?: boolean;
}

export type ComponentContribution =
  | GlobalSearchPanelContribution
  | ExplorerViewContribution
  | TitleBarControlContribution
  | ChatModelExtensionContribution
  | ChatToolResultContribution
  | AdminModelSettingsContribution
  | DashboardWidgetContribution;

export interface SwitchControlDefinition {
  type: 'switch';
  label: string;
  defaultValue: boolean;
}

export type HostControlDefinition = SwitchControlDefinition;

export interface ToolContributionAction {
  type: 'tool';
  tool: string;
  params?: Record<string, unknown>;
}

export type ContributionActionDefinition = ToolContributionAction;

export interface WorkspaceCreatedContributionContext {
  workspaceId: string;
  workspaceName: string;
  workspacePath: string;
}

export interface WorkspaceCreationOptionContribution {
  id: string;
  extensionPoint: 'workspace.create.option';
  control: SwitchControlDefinition;
  action: ToolContributionAction;
}

export type ControlContribution = WorkspaceCreationOptionContribution;
export type AppContribution = ComponentContribution | ControlContribution;

export interface AppContributions {
  components: ComponentContribution[];
  controls: ControlContribution[];
}

export type ContributionForExtensionPoint<P extends AppExtensionPointId> = Extract<
  AppContribution,
  { extensionPoint: P }
>;

export type AppContributionDiagnosticCode =
  | 'invalid-structure'
  | 'invalid-contribution'
  | 'unknown-extension-point'
  | 'duplicate-id';

/** A non-fatal manifest contribution problem found during Electron discovery. */
export interface AppContributionDiagnostic {
  code: AppContributionDiagnosticCode;
  message: string;
  contributionId?: string;
  extensionPoint?: string;
}
