/**
 * Loads Sero's production file tools for the eval runtime.
 *
 * These are the tools an agent session actually gets — the same
 * `createBash`/`createRead`/`createWrite`/`createEdit` factories that
 * `createRuntimeTools` composes, on the production host runtime — so the
 * `file-tools` eval measures the agent's real tool surface rather than a copy
 * (#658). `createRuntimeTools` itself is not used here because it also builds
 * the `sero-cli` and browser tools, which need the desktop app this harness runs
 * without.
 */

import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import { HostBackend } from '../apps/desktop/electron/features/workspace/runtime/backends/host/host-backend';
import {
  createBash,
  createEdit,
  createRead,
  createWrite,
} from '../apps/desktop/electron/features/container/tools/tools-coding';

export async function loadRuntimeHostTools(basedir: string): Promise<ToolDefinition[]> {
  const runtime = new HostBackend({ workspaceId: 'eval-workspace', hostWorkspacePath: basedir });
  return [
    createBash(runtime, basedir),
    createRead(runtime, basedir),
    createWrite(runtime, basedir),
    createEdit(runtime, basedir),
  ];
}
