import type { McpMetadataCacheDocument } from '../cache/metadata-cache';
import type { McpConfigDocument } from '../config/types';
import type { buildSnapshot } from '../state/snapshot';
import type { McpServerEditorInput } from '../../shared/types';

export interface ManagerActionOptions {
  cwd?: string;
  rawConfig?: string;
  serverName?: string;
  resourceUri?: string;
  toolName?: string;
  toolArguments?: Record<string, unknown>;
  viewerId?: string;
  /** The chat session that shows an app, for open_tool_ui. */
  sessionId?: string;
  toolCallId?: string;
  toolResult?: Record<string, unknown>;
  callbackUrl?: string;
  serverInput?: McpServerEditorInput;
}

export interface SyncSnapshotOptions {
  /** Effective config with Agent Plugin sources already applied. */
  config?: McpConfigDocument;
  rawConfigUpdatedAt?: string | null;
  metadataCache?: McpMetadataCacheDocument;
}

export interface SyncedRuntimeState {
  configPath: string;
  statePath: string;
  config: McpConfigDocument;
  metadataCache: McpMetadataCacheDocument;
  rawConfigUpdatedAt: string | null;
  snapshot: Awaited<ReturnType<typeof buildSnapshot>>;
}
