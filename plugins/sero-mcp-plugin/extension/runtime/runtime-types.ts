import type { McpMetadataCacheDocument } from '../cache/metadata-cache';
import type { McpConfigDocument } from '../config/types';
import type { buildSnapshot } from '../state/snapshot';

export interface SyncedRuntimeState {
  configPath: string;
  statePath: string;
  config: McpConfigDocument;
  metadataCache: McpMetadataCacheDocument;
  rawConfigUpdatedAt: string | null;
  snapshot: Awaited<ReturnType<typeof buildSnapshot>>;
}
