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
  taskId?: string;
  /** For set_skill_enabled: the skill's SKILL.md URI and the new state. */
  skillUri?: string;
  enabled?: boolean;
  /** The chat session that shows an app, for open_tool_ui. */
  sessionId?: string;
  /**
   * The chat session that actually made the call, from the extension context.
   * Security checks such as the remote-skill read guard use this, never the
   * model-supplied `sessionId`.
   */
  callerSessionId?: string;
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
