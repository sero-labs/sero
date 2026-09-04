/**
 * Remote widget registry — which plugin widgets a browser may load.
 *
 * A widget opts in with `remote: true` in its manifest. Everything else
 * is invisible here: not listed, and its assets are not served.
 *
 * The registry also resolves a widget's state file. The browser never
 * sees a host path — it gets an opaque key and the host maps it back,
 * so a remote client cannot name a file of its own choosing.
 */

import path from 'path';
import type { SeroAppManifest } from '@/types/sero-apps';
import type { DashboardWidgetContribution } from '@sero-ai/common';
import { registerRemoteAssets, unregisterRemoteAssets } from './ext-assets';

/** One widget a browser may load. */
export interface GatewayRemoteWidget {
  appId: string;
  appName: string;
  widgetId: string;
  name: string;
  /** The export to load from the federated remote. */
  component: string;
  description?: string;
  defaultSize: { w: number; h: number };
  /** Module-federation remote name, derived from the app id. */
  remoteName: string;
  /** Where the browser fetches this app's federation manifest. */
  remoteEntry: string;
  /** Opaque handle for this widget's state file. */
  stateKey: string;
  /** Whether the state is per-workspace or one file for the profile. */
  scope: 'global' | 'workspace';
}

interface RegisteredApp {
  manifest: SeroAppManifest;
  widgets: DashboardWidgetContribution[];
}

const apps = new Map<string, RegisteredApp>();

/** The MF remote name for an app id, matching the desktop registry. */
export function toRemoteName(appId: string): string {
  return `sero_${appId.replace(/-/g, '_')}`;
}

/** Widgets in this manifest that opted in to running remotely. */
function remoteWidgetsOf(manifest: SeroAppManifest): DashboardWidgetContribution[] {
  return manifest.contributions.components.filter(
    (contribution): contribution is DashboardWidgetContribution =>
      contribution.extensionPoint === 'ui.dashboard.widget' && contribution.remote === true,
  );
}

/**
 * Record an app's remote widgets, or forget it when it has none.
 *
 * Registering the assets here and nowhere else is what keeps a plugin
 * without a remote widget unreachable over the gateway.
 */
export function registerRemoteWidgets(manifest: SeroAppManifest): void {
  const widgets = remoteWidgetsOf(manifest);
  if (widgets.length === 0 || !manifest.uiEntry) {
    apps.delete(manifest.id);
    unregisterRemoteAssets(manifest.id);
    return;
  }

  apps.set(manifest.id, { manifest, widgets });
  registerRemoteAssets(manifest.id, manifest.packagePath);
}

/** Record every app in one pass. */
export function registerAllRemoteWidgets(manifests: SeroAppManifest[]): void {
  for (const manifest of manifests) registerRemoteWidgets(manifest);
}

/** Forget an app, so its widgets and assets stop being reachable. */
export function unregisterRemoteWidgets(appId: string): void {
  apps.delete(appId);
  unregisterRemoteAssets(appId);
}

/** Test seam. Forgets every app. */
export function resetRemoteWidgets(): void {
  for (const appId of apps.keys()) unregisterRemoteAssets(appId);
  apps.clear();
}

/**
 * The opaque state handle for one widget.
 *
 * A workspace-scoped app has one state file per workspace, so the key
 * carries the workspace; a global app has one file for the profile.
 */
export function buildStateKey(
  appId: string,
  scope: 'global' | 'workspace',
  workspaceId: string | null,
): string {
  return scope === 'workspace' && workspaceId ? `${appId}@${workspaceId}` : appId;
}

/**
 * Every remote widget, with a fetch URL carrying `issueTicket`'s ticket.
 *
 * `workspaceId` decides which workspace a workspace-scoped widget reads.
 */
export function listRemoteWidgets(
  workspaceId: string | null,
  issueTicket: (appId: string) => string,
): GatewayRemoteWidget[] {
  const listed: GatewayRemoteWidget[] = [];

  for (const { manifest, widgets } of apps.values()) {
    const ticket = issueTicket(manifest.id);
    for (const widget of widgets) {
      listed.push({
        appId: manifest.id,
        appName: manifest.name,
        widgetId: widget.id,
        name: widget.name,
        component: widget.component,
        description: widget.description,
        defaultSize: widget.defaultSize,
        remoteName: toRemoteName(manifest.id),
        remoteEntry: `/ext/${manifest.id}/mf-manifest.json?t=${encodeURIComponent(ticket)}`,
        stateKey: buildStateKey(manifest.id, manifest.scope, workspaceId),
        scope: manifest.scope,
      });
    }
  }

  return listed;
}

/**
 * The state file a key names, or null when the key names nothing.
 *
 * `resolveWorkspacePath` turns a workspace id into its root; a workspace
 * the caller cannot reach must return null there, which is what stops a
 * key from reading across a token's scope.
 */
export function resolveStateFile(
  stateKey: string,
  resolveWorkspacePath: (workspaceId: string) => string | null,
): string | null {
  const at = stateKey.lastIndexOf('@');
  const appId = at === -1 ? stateKey : stateKey.slice(0, at);
  const workspaceId = at === -1 ? null : stateKey.slice(at + 1);

  const entry = apps.get(appId);
  if (!entry) return null;

  const { manifest } = entry;

  if (manifest.scope === 'global') {
    return manifest.globalStatePath;
  }

  if (!workspaceId) return null;
  const workspacePath = resolveWorkspacePath(workspaceId);
  if (!workspacePath) return null;

  return path.resolve(workspacePath, manifest.stateFile);
}
