import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpResourcePreview } from '../../shared/types';
import { readMetadataCache, type McpMetadataCacheDocument } from '../cache/metadata-cache';
import type { McpConfigDocument } from '../config/types';
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

export async function readServerResourceAction(options: {
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
}): Promise<ToolResult> {
  const serverName = options.serverName?.trim();
  const resourceUri = options.resourceUri?.trim();
  if (!serverName) {
    return createToolResult('Error: Server name is required.', { snapshotWritten: false });
  }
  if (!resourceUri) {
    return createToolResult('Error: Resource URI is required.', { snapshotWritten: false });
  }

  const synced = await options.syncSnapshot(options.cwd);
  const serverConfig = synced.config.mcpServers[serverName];
  if (!serverConfig) {
    return createToolResult(`Error: Server "${serverName}" does not exist.`, { snapshotWritten: false });
  }
  if (serverConfig.enabled === false) {
    return createToolResult(`Error: Server "${serverName}" is disabled. Enable it before reading resources.`, {
      snapshotWritten: false,
    });
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
      return createToolResult(
        nextConnection.status === 'needs-auth'
          ? `Error: Server "${serverName}" needs authentication before resources can be opened.`
          : `Error: Server "${serverName}" failed to connect before reading resources.`,
        {
          snapshotWritten,
          connectionStatus: runtimeStatus.connectionStatus,
          authStatus: runtimeStatus.authStatus,
          lastError: runtimeStatus.lastError ?? null,
        },
      );
    }
  }

  try {
    const result = await options.manager.readResource(serverName, resourceUri);
    const preview = normalizeResourcePreview(serverName, resourceUri, result);
    return createToolResult(`Loaded resource "${preview.resolvedUri}" from "${serverName}".`, {
      snapshotWritten,
      serverName,
      resourceUri,
      resourcePreview: preview,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createToolResult(`Error: Failed to read resource "${resourceUri}" from "${serverName}". ${message}`, {
      snapshotWritten,
      serverName,
      resourceUri,
    });
  }
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
