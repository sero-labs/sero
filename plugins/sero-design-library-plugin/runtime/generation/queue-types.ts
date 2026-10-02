/**
 * What a design to change from the queue is run with.
 *
 * Split out of queue.ts (500-LOC limit); re-exported from there.
 */

import type { AppRuntimeHost } from '@sero-ai/common';

import type { DesignLibraryPaths } from '../../shared/paths';

export interface VariantQueueContext {
  host: AppRuntimeHost;
  paths: DesignLibraryPaths;
  workspaceId: string;
  sessionId: string;
  onError(message: string, error: unknown): void;
}
