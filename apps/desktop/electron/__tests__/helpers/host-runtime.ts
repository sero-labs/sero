/**
 * The host runtime a real host workspace gets (#658).
 *
 * These tests used to run `tools-host.ts`, a second copy of `bash`, `read`,
 * `write` and `edit` that production never imported — so a fault in the tools a
 * session actually runs could pass every one of them. They now run the
 * production tools, which means they need a runtime. This is the production one:
 * `HostBackend`, with its own path mapping and shell handling, so the tests see
 * what the app sees rather than a fixture's idea of it.
 */

import { HostBackend } from '@electron/features/workspace/runtime/backends/host/host-backend';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';

export function createHostRuntime(hostWorkspacePath: string, workspaceId = 'ws-1'): RuntimeBackend {
  return new HostBackend({ workspaceId, hostWorkspacePath });
}
