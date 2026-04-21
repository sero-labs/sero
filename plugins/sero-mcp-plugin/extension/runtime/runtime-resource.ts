import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpResourcePreview } from '../../shared/types';
import { readMetadataCache, type McpMetadataCacheDocument } from '../cache/metadata-cache';
import {
  isResourceExposureEnabled,
  type McpConfigDocument,
} from '../config/types';
import { McpServerManager } from '../manager/server-manager';
import type { RuntimeServerStatus } from '../state/snapshot';
import { createToolResult, type ToolResult } from '../tools/types';
import { reconcileConnection } from './runtime-connect';
import type { SyncedRuntimeState } from './runtime-types';

const MAX_PREVIEW_TEXT_LENGTH = 200_000;

interface ResourceContentRecord {
  uri?: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

interface ResourceActionOptions {
  cwd?: string;
  serverName?: string;
  resourceUri?: string;
  manager: McpServerManager;
  setRuntimeStatus: (serverName: string, status: RuntimeServerStatus) => void;
  syncSnapshot: (
    cwd?: string,
    options?: {
      config?: McpConfigDocument;
      metadataCache?: McpMetadataCacheDocument;
      rawConfigUpdatedAt?: string | null;
    },
  ) => Promise<SyncedRuntimeState>;
}

export async function readServerResourceAction(options: ResourceActionOptions): Promise<ToolResult> {
  const resourceResult = await loadResourcePreview(options);
  if ('errorResult' in resourceResult) {
    return resourceResult.errorResult;
  }

  const { preview, snapshotWritten } = resourceResult;
  return createToolResult(`Loaded resource "${preview.resolvedUri}" from "${preview.serverName}".`, {
    snapshotWritten,
    serverName: preview.serverName,
    resourceUri: preview.resolvedUri,
    resourcePreview: preview,
  });
}

export async function readProxyResourceAction(options: ResourceActionOptions): Promise<ToolResult> {
  const resourceResult = await loadResourcePreview(options);
  if ('errorResult' in resourceResult) {
    return resourceResult.errorResult;
  }

  const { preview, snapshotWritten } = resourceResult;
  return createToolResult(formatProxyResourcePreview(preview), {
    snapshotWritten,
    serverName: preview.serverName,
    resourceUri: preview.resolvedUri,
    resourcePreview: preview,
  });
}

export function normalizeResourcePreview(
  serverName: string,
  requestedUri: string,
  result: ReadResourceResult,
): McpResourcePreview {
  const content = selectPreferredContent(result, requestedUri);
  const mimeType = normalizeMimeType(content.mimeType);

  if (mimeType?.startsWith('image/') && typeof content.blob === 'string') {
    return {
      serverName,
      requestedUri,
      resolvedUri: content.uri ?? requestedUri,
      mimeType,
      previewKind: 'image',
      dataUrl: `data:${mimeType};base64,${content.blob}`,
      truncated: false,
    };
  }

  const decodedText = decodeTextContent(content);
  const truncated = decodedText.length > MAX_PREVIEW_TEXT_LENGTH;
  const previewText = decodedText.slice(0, MAX_PREVIEW_TEXT_LENGTH);

  if (mimeType?.startsWith('text/html')) {
    return {
      serverName,
      requestedUri,
      resolvedUri: content.uri ?? requestedUri,
      mimeType,
      previewKind: 'html',
      html: previewText,
      truncated,
    };
  }

  if (mimeType?.includes('json')) {
    return {
      serverName,
      requestedUri,
      resolvedUri: content.uri ?? requestedUri,
      mimeType,
      previewKind: 'json',
      text: formatJsonPreview(previewText),
      truncated,
    };
  }

  if (decodedText.length > 0) {
    return {
      serverName,
      requestedUri,
      resolvedUri: content.uri ?? requestedUri,
      mimeType,
      previewKind: 'text',
      text: previewText,
      truncated,
    };
  }

  return {
    serverName,
    requestedUri,
    resolvedUri: content.uri ?? requestedUri,
    mimeType,
    previewKind: 'binary',
    truncated: false,
  };
}

function selectPreferredContent(result: ReadResourceResult, requestedUri: string): ResourceContentRecord {
  const contents = (result.contents ?? []) as ResourceContentRecord[];
  if (contents.length === 0) {
    throw new Error(`No contents were returned for resource "${requestedUri}".`);
  }

  return contents.find((content) => content.uri === requestedUri) ?? contents[0];
}

function normalizeMimeType(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

function decodeTextContent(content: ResourceContentRecord): string {
  if (typeof content.text === 'string') {
    return content.text;
  }
  if (typeof content.blob === 'string' && isTextLikeMimeType(content.mimeType)) {
    return Buffer.from(content.blob, 'base64').toString('utf8');
  }
  return '';
}

function isTextLikeMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) return true;
  const normalized = mimeType.toLowerCase();
  return normalized.startsWith('text/') || normalized.includes('json') || normalized.includes('xml') || normalized.includes('javascript');
}

function formatJsonPreview(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function buildAuthRequiredMessage(serverName: string): string {
  return `Server "${serverName}" requires in-app authentication. Open the MCP app in Sero and authenticate there.`;
}

export function buildResourcesDisabledMessage(serverName: string): string {
  return `Resource exposure is disabled for "${serverName}". Enable \"Expose resources\" in the MCP app to list or read resources.`;
}

async function loadResourcePreview(options: ResourceActionOptions): Promise<
  | { preview: McpResourcePreview; snapshotWritten: boolean }
  | { errorResult: ToolResult }
> {
  const serverName = options.serverName?.trim();
  const resourceUri = options.resourceUri?.trim();
  if (!serverName) {
    return { errorResult: createToolResult('Error: Server name is required.', { snapshotWritten: false }) };
  }
  if (!resourceUri) {
    return { errorResult: createToolResult('Error: Resource URI is required.', { snapshotWritten: false }) };
  }

  const synced = await options.syncSnapshot(options.cwd);
  const serverConfig = synced.config.mcpServers[serverName];
  if (!serverConfig) {
    return { errorResult: createToolResult(`Error: Server "${serverName}" does not exist.`, { snapshotWritten: false }) };
  }
  if (serverConfig.enabled === false) {
    return {
      errorResult: createToolResult(`Error: Server "${serverName}" is disabled. Enable it before reading resources.`, {
        snapshotWritten: false,
      }),
    };
  }
  if (!isResourceExposureEnabled(serverConfig)) {
    return {
      errorResult: createToolResult(buildResourcesDisabledMessage(serverName), {
        snapshotWritten: false,
        serverName,
        resourceUri,
        resourceExposureEnabled: false,
      }),
    };
  }

  let snapshotWritten = false;
  const connection = options.manager.getConnection(serverName);
  if (!connection || connection.status !== 'connected') {
    const nextConnection = await options.manager.connect(serverName, serverConfig);
    const metadataCache = await readMetadataCache();
    const { nextCache, runtimeStatus } = await reconcileConnection({
      serverName,
      serverConfig,
      metadataCache,
      connection: nextConnection,
    });
    options.setRuntimeStatus(serverName, runtimeStatus);
    await options.syncSnapshot(options.cwd, { config: synced.config, metadataCache: nextCache });
    snapshotWritten = true;

    if (nextConnection.status !== 'connected') {
      return {
        errorResult: createToolResult(
          nextConnection.status === 'needs-auth'
            ? buildAuthRequiredMessage(serverName)
            : `Error: Server "${serverName}" failed to connect before reading resources.`,
          {
            snapshotWritten,
            connectionStatus: runtimeStatus.connectionStatus,
            authStatus: runtimeStatus.authStatus,
            lastError: runtimeStatus.lastError ?? null,
            authRequired: nextConnection.status === 'needs-auth',
          },
        ),
      };
    }
  }

  try {
    const result = await options.manager.readResource(serverName, resourceUri);
    return {
      preview: normalizeResourcePreview(serverName, resourceUri, result),
      snapshotWritten,
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      const message = error.message || 'Authentication is required.';
      await options.manager.close(serverName);
      options.setRuntimeStatus(serverName, {
        connectionStatus: 'needs-auth',
        authStatus: 'not-authenticated',
        lastError: message,
        lastConnectedAt: null,
        lastFailedAt: new Date().toISOString(),
      });
      await options.syncSnapshot(options.cwd, { config: synced.config });
      return {
        errorResult: createToolResult(buildAuthRequiredMessage(serverName), {
          snapshotWritten: true,
          serverName,
          resourceUri,
          authRequired: true,
        }),
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      errorResult: createToolResult(`Error: Failed to read resource "${resourceUri}" from "${serverName}". ${message}`, {
        snapshotWritten,
        serverName,
        resourceUri,
      }),
    };
  }
}

function formatProxyResourcePreview(preview: McpResourcePreview): string {
  const header = `MCP resource from ${preview.serverName}: ${preview.resolvedUri}`;
  const metadata = `Kind: ${preview.previewKind}${preview.mimeType ? ` · ${preview.mimeType}` : ''}`;
  if (preview.previewKind === 'image') {
    return `${header}\n${metadata}\n\nThis resource is an image. Open it in the MCP app for the embedded visual preview.`;
  }
  if (preview.previewKind === 'binary') {
    return `${header}\n${metadata}\n\nThis resource returned binary content that cannot be rendered inline by the bridged MCP proxy.`;
  }

  const body = preview.previewKind === 'html' ? preview.html ?? '' : preview.text ?? '(empty resource)';
  const truncatedNote = preview.truncated ? '\n\nPreview truncated for proxy output.' : '';
  return `${header}\n${metadata}\n\n${body}${truncatedNote}`;
}
