import type { AppRuntimeHost } from '@sero-ai/common';

import type { DesignLibraryPaths } from '../shared/paths';
import type { ExportRequests } from './export-requests';
import type { MediaQueueContext } from './media/queue';

export interface CoordinatorContext {
  host: AppRuntimeHost;
  paths: DesignLibraryPaths;
  workspaceId: string;
  sessionId: string;
  onError(message: string, error: unknown): void;
  /** Test and fault-injection seam; defaults to the shipped fal adapter. */
  createMediaProvider?: MediaQueueContext['createProvider'];
  /** Test seam for export persistence failures. */
  exportRequests?: Pick<ExportRequests, 'apply'>;
}
