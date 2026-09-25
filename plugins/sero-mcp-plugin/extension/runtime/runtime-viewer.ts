import { readMetadataCache } from '../cache/metadata-cache';
import {
  isResourceExposureEnabled,
  type McpConfigDocument,
} from '../config/types';
import type { ManagedConnection, ManagedTool } from '../manager/types';
import type { McpServerManager } from '../manager/server-manager';
import type { RuntimeServerStatus } from '../state/snapshot';
import { createToolResult, type ToolResult } from '../tools/types';
import type { UiResourceHandler } from '../viewer/ui-resource-handler';
import type { McpUiServer, UiSessionOptions } from '../viewer/ui-server';
import { askToOpenPage, canAskUser, toWebUrl } from '../elicitation/ask-user';
import { deliverAppMessage, type SessionRegistry } from './app-messages';
import { chooseAppPermissions, type AppPermissionChoices } from '../viewer/app-permissions';
import type { UiResourceContent } from '../viewer/types';
import { reconcileConnection } from './runtime-connect';
import { buildResourcesDisabledMessage, readServerResourceAction } from './runtime-resource';
import type { SyncedRuntimeState } from './runtime-types';

interface ViewerActionOptions {
  cwd?: string;
  serverName?: string;
  resourceUri?: string;
  toolName?: string;
  toolArguments?: Record<string, unknown>;
  viewerId?: string;
  sessionId?: string;
  toolResult?: Record<string, unknown>;
  sessions: SessionRegistry;
  permissionChoices: AppPermissionChoices;
  manager: McpServerManager;
  uiResourceHandler: UiResourceHandler;
  uiServer: McpUiServer;
  setRuntimeStatus: (serverName: string, status: RuntimeServerStatus) => void;
  syncSnapshot: (
    cwd?: string,
    options?: {
      config?: McpConfigDocument;
      metadataCache?: Awaited<ReturnType<typeof readMetadataCache>>;
      rawConfigUpdatedAt?: string | null;
    },
  ) => Promise<SyncedRuntimeState>;
}

export async function openViewerResourceAction(options: ViewerActionOptions): Promise<ToolResult> {
  const resourceUri = options.resourceUri?.trim();
  if (!resourceUri) {
    return createToolResult('Error: Resource URI is required.', { snapshotWritten: false });
  }

  if (!resourceUri.startsWith('ui://')) {
    return readServerResourceAction(options);
  }

  const ensured = await ensureConnectedServer(options, { requireExposedResources: true });
  if ('errorResult' in ensured) {
    return ensured.errorResult;
  }

  try {
    const resource = await options.uiResourceHandler.readUiResource(ensured.serverName, resourceUri);
    const session = await options.uiServer.open({
      serverName: ensured.serverName,
      resourceUri,
      title: resourceUri,
      resource,
      grantedPermissions: await grantPermissions(ensured, options, resourceUri, resourceUri, resource),
      ...sessionHooks(ensured, options, resourceUri),
    });

    return createToolResult(`Opened MCP UI resource "${resourceUri}" from "${ensured.serverName}".`, {
      snapshotWritten: ensured.snapshotWritten,
      serverName: ensured.serverName,
      resourceUri,
      viewerId: session.viewerId,
      viewerUrl: session.viewerUrl,
      allowAttribute: session.allowAttribute,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createToolResult(`Error: Failed to open MCP UI resource "${resourceUri}". ${message}`, {
      snapshotWritten: ensured.snapshotWritten,
      serverName: ensured.serverName,
      resourceUri,
    });
  }
}

export async function openToolUiAction(options: ViewerActionOptions): Promise<ToolResult> {
  const ensured = await ensureConnectedServer(options);
  if ('errorResult' in ensured) {
    return ensured.errorResult;
  }

  const toolName = options.toolName?.trim() || '';
  const connection = options.manager.getConnection(ensured.serverName);
  const tool = findTool(connection, toolName);
  const resourceUri = resolveToolUiResourceUri(tool, options.resourceUri);
  if (!resourceUri) {
    return createToolResult('Error: A UI resource URI is required for this MCP tool.', { snapshotWritten: ensured.snapshotWritten });
  }

  try {
    const resource = await options.uiResourceHandler.readUiResource(ensured.serverName, resourceUri);
    const session = await options.uiServer.open({
      serverName: ensured.serverName,
      resourceUri,
      title: toolName || resourceUri,
      resource,
      toolInfo: tool ? { name: tool.name, description: tool.description, inputSchema: tool.inputSchema } : undefined,
      toolArgs: options.toolArguments,
      toolResult: options.toolResult,
      grantedPermissions: await grantPermissions(ensured, options, resourceUri, toolName || resourceUri, resource),
      ...sessionHooks(ensured, options, toolName || resourceUri),
    });

    return createToolResult(`Opened MCP tool UI for "${toolName || resourceUri}" from "${ensured.serverName}".`, {
      snapshotWritten: ensured.snapshotWritten,
      serverName: ensured.serverName,
      resourceUri,
      toolName: toolName || null,
      viewerId: session.viewerId,
      viewerUrl: session.viewerUrl,
      allowAttribute: session.allowAttribute,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createToolResult(`Error: Failed to open MCP tool UI "${toolName || resourceUri}". ${message}`, {
      snapshotWritten: ensured.snapshotWritten,
      serverName: ensured.serverName,
      resourceUri,
      toolName: toolName || null,
      reason: message,
    });
  }
}

export function closeViewerAction(options: Pick<ViewerActionOptions, 'uiServer' | 'viewerId'>): ToolResult {
  const viewerId = options.viewerId?.trim();
  if (!viewerId) {
    return createToolResult('Error: Viewer ID is required.', { sessionClosed: false });
  }
  const closed = options.uiServer.close(viewerId, 'closed-from-ui');
  return createToolResult(closed ? 'Closed the MCP viewer session.' : 'The MCP viewer session is already closed.', {
    sessionClosed: closed,
    viewerId,
  });
}

interface EnsuredConnectedServer {
  config: McpConfigDocument;
  serverName: string;
  snapshotWritten: boolean;
}

async function ensureConnectedServer(
  options: ViewerActionOptions,
  policy: { requireExposedResources?: boolean } = {},
): Promise<EnsuredConnectedServer | { errorResult: ToolResult }> {
  const serverName = options.serverName?.trim();
  if (!serverName) {
    return { errorResult: createToolResult('Error: Server name is required.', { snapshotWritten: false }) };
  }

  const synced = await options.syncSnapshot(options.cwd);
  const serverConfig = synced.config.mcpServers[serverName];
  if (!serverConfig) {
    return { errorResult: createToolResult(`Error: Server "${serverName}" does not exist.`, { snapshotWritten: false }) };
  }
  if (serverConfig.enabled === false) {
    return {
      errorResult: createToolResult(`Error: Server "${serverName}" is disabled. Enable it before opening MCP UIs.`, {
        snapshotWritten: false,
      }),
    };
  }
  if (policy.requireExposedResources && !isResourceExposureEnabled(serverConfig)) {
    return {
      errorResult: createToolResult(buildResourcesDisabledMessage(serverName), {
        snapshotWritten: false,
        serverName,
        resourceUri: options.resourceUri ?? null,
        resourceExposureEnabled: false,
      }),
    };
  }

  const existingConnection = options.manager.getConnection(serverName);
  if (existingConnection?.status === 'connected') {
    return { config: synced.config, serverName, snapshotWritten: false };
  }

  const [nextConnection, metadataCache] = await Promise.all([
    options.manager.connect(serverName, serverConfig),
    readMetadataCache(),
  ]);
  const { nextCache, runtimeStatus } = await reconcileConnection({
    serverName,
    serverConfig,
    metadataCache,
    connection: nextConnection,
  });
  options.setRuntimeStatus(serverName, runtimeStatus);
  await options.syncSnapshot(options.cwd, {
    config: synced.config,
    metadataCache: nextCache,
    rawConfigUpdatedAt: synced.rawConfigUpdatedAt,
  });

  if (nextConnection.status !== 'connected') {
    return {
      errorResult: createToolResult(
        nextConnection.status === 'needs-auth'
          ? `Server "${serverName}" requires in-app authentication. Open the MCP app in Sero and authenticate there.`
          : `Error: Server "${serverName}" failed to connect before opening an MCP UI.`,
        {
          snapshotWritten: true,
          connectionStatus: runtimeStatus.connectionStatus,
          authStatus: runtimeStatus.authStatus,
          lastError: runtimeStatus.lastError ?? null,
          authRequired: nextConnection.status === 'needs-auth',
          metadataCache: nextCache,
        },
      ),
    };
  }

  return { config: synced.config, serverName, snapshotWritten: true };
}

function grantPermissions(
  ensured: EnsuredConnectedServer,
  options: ViewerActionOptions,
  resourceUri: string,
  appName: string,
  resource: UiResourceContent,
) {
  return chooseAppPermissions(resource.meta.permissions, {
    appKey: `${ensured.serverName}\n${resourceUri}`,
    appLabel: `${ensured.serverName} · ${appName} app`,
    choices: options.permissionChoices,
  });
}

/** Session settings that come from the server config and the user, the same for every viewer. */
function sessionHooks(ensured: EnsuredConnectedServer, options: ViewerActionOptions, appName: string): Pick<
  UiSessionOptions, 'excludeTools' | 'onUnauthorized' | 'onOpenLink' | 'onAppMessage'
> {
  const serverLabel = ensured.serverName;
  const appLabel = `${serverLabel} · ${appName} app`;
  const send = options.sessions.get(options.sessionId);
  return {
    onAppMessage: send ? (kind, params) => deliverAppMessage(send, appLabel, kind, params) : undefined,
    excludeTools: ensured.config.mcpServers[serverLabel]?.excludeTools,
    onUnauthorized: async (_serverName, message) => {
      await handleUnauthorized(ensured, options, message);
    },
    onOpenLink: async (url) => {
      const webUrl = toWebUrl(url);
      if (!webUrl || !canAskUser()) return false;
      return await askToOpenPage(webUrl, { serverLabel, source: appLabel }) === 'open';
    },
  };
}

async function handleUnauthorized(
  ensured: EnsuredConnectedServer,
  options: ViewerActionOptions,
  message: string,
): Promise<void> {
  await options.manager.close(ensured.serverName);
  options.setRuntimeStatus(ensured.serverName, {
    connectionStatus: 'needs-auth',
    authStatus: 'not-authenticated',
    lastError: message,
    lastConnectedAt: null,
    lastFailedAt: new Date().toISOString(),
  });
  await options.syncSnapshot(options.cwd, { config: ensured.config });
}

function findTool(connection: ManagedConnection | undefined, toolName: string): ManagedTool | undefined {
  if (!toolName) {
    return undefined;
  }
  return connection?.tools.find((tool) => tool.name === toolName);
}

function resolveToolUiResourceUri(tool: ManagedTool | undefined, resourceUri: string | undefined): string {
  const direct = resourceUri?.trim();
  if (direct) {
    return direct;
  }
  if (!tool?._meta || typeof tool._meta !== 'object') {
    return '';
  }
  const ui = tool._meta.ui;
  if (!ui || typeof ui !== 'object' || Array.isArray(ui)) {
    return '';
  }
  return typeof (ui as Record<string, unknown>).resourceUri === 'string'
    ? (ui as Record<string, unknown>).resourceUri as string
    : '';
}
