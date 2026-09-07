/**
 * Workspace creation for plugin callers (the app-runtime host and the typed
 * `window.sero.workspace` bridge).
 *
 * The Add Workspace menu creates the workspace over IPC and then runs the
 * `workspace.create.option` contributions the user ticked, in the renderer.
 * A plugin has no menu, so this path runs the contributions that are on by
 * default in the main process instead, and otherwise does exactly what the
 * menu does: same manager, same home-directory guard, same runtime reconcile,
 * same workspace-changed push.
 */

import type {
  AppToolResult,
  WorkspaceCreatedContributionContext,
  WorkspaceCreationOptionContribution,
} from '@sero-ai/common';
import type { SeroAppManifest, WorkspaceCreateOptions, WorkspaceInfo } from '@/types/ipc';

export const WORKSPACE_CREATE_CAPABILITY = 'appRuntime.workspaceCreate';

export interface CreateWorkspaceForAppDeps {
  create(name: string, parentPath?: string, options?: WorkspaceCreateOptions): Promise<WorkspaceInfo>;
  reconcileAppRuntimes(reason: string): Promise<void>;
  discoverApps(): Promise<SeroAppManifest[]>;
  invokeAppTool(
    appId: string,
    workspaceId: string,
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<AppToolResult>;
  notifyWorkspaceChanged(): void;
}

export interface CreateWorkspaceForAppRequest {
  name: string;
  parentPath?: string;
  options?: WorkspaceCreateOptions;
}

/**
 * Refuses a runtime that never declared the capability. The declaration is a
 * compatibility statement, so an undeclared call is a plugin bug, and the
 * message names the fix.
 */
export function assertWorkspaceCreateDeclared(manifest: Pick<SeroAppManifest, 'id' | 'plugin'>): void {
  const declared = manifest.plugin?.requiredHostCapabilities ?? [];
  if (declared.includes(WORKSPACE_CREATE_CAPABILITY)) return;
  throw new Error(
    `App "${manifest.id}" cannot create workspaces: add "${WORKSPACE_CREATE_CAPABILITY}" to sero.plugin.requiredHostCapabilities`,
  );
}

function defaultOnOptions(
  apps: SeroAppManifest[],
): Array<{ appId: string; contribution: WorkspaceCreationOptionContribution }> {
  return apps.flatMap((app) =>
    app.contributions.controls
      .filter((control) => control.extensionPoint === 'workspace.create.option')
      .filter((control) => control.control.defaultValue)
      .map((contribution) => ({ appId: app.id, contribution })),
  );
}

/** Runs the default-on creation options; a failure is logged, never fatal, as in the menu. */
async function applyAppDefaults(deps: CreateWorkspaceForAppDeps, workspace: WorkspaceInfo): Promise<void> {
  const hostContext: WorkspaceCreatedContributionContext = {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspacePath: workspace.path,
  };
  const options = defaultOnOptions(await deps.discoverApps());
  await Promise.all(options.map(async ({ appId, contribution }) => {
    try {
      const result = await deps.invokeAppTool(appId, workspace.id, contribution.action.tool, {
        ...contribution.action.params,
        ...hostContext,
      });
      if (result.isError) {
        console.warn(`[workspace] ${contribution.control.label}: ${result.text || 'Setup failed.'}`);
      }
    } catch (error) {
      console.warn(`[workspace] ${contribution.control.label}:`, error);
    }
  }));
}

export async function createWorkspaceForApp(
  deps: CreateWorkspaceForAppDeps,
  request: CreateWorkspaceForAppRequest,
): Promise<WorkspaceInfo> {
  const { applyAppDefaults: withDefaults, ...managerOptions } = request.options ?? {};
  const workspace = await deps.create(request.name, request.parentPath, managerOptions);
  await deps.reconcileAppRuntimes('workspace create');
  if (withDefaults) await applyAppDefaults(deps, workspace);
  deps.notifyWorkspaceChanged();
  return workspace;
}
