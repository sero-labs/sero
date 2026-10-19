/**
 * Container-proxied tool definitions for agent sessions.
 *
 * These replace Pi SDK's createCodingTools() — every tool executes
 * inside the workspace's container via `container exec`, except `sero-cli`
 * which routes to host-side Sero commands.
 */

import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';
import { createBash, createRead, createWrite, createEdit } from './tools-coding';
import { createBrowser } from './tools-browser';
import { createWorkspaceCliTool } from '@electron/cli';
import { browserPackStatus, ensureBrowserPackForAgent } from '@electron/features/workspace/runtime/install-actions';

/**
 * Build all container tools for a workspace.
 * These are passed as `customTools` to `createAgentSession()`.
 *
 * @param containerCwd — override the default `/workspace` CWD for coding tools
 *   (e.g. when running in a git worktree subdirectory).
 */
export async function createRuntimeTools(
  runtime: RuntimeBackend,
  sessionId: string,
  runtimeCwd?: string,
  bashMaxSeconds?: number,
): Promise<ToolDefinition[]> {
  const tools = [
    createBash(runtime, runtimeCwd, sessionId, bashMaxSeconds),
    createRead(runtime, runtimeCwd),
    createWrite(runtime, runtimeCwd),
    createEdit(runtime, runtimeCwd),
    createWorkspaceCliTool(runtime.workspaceId, sessionId),
  ];
  if (await isBrowserAutomationAvailable(runtime)) tools.push(createBrowser(runtime, runtime.workspaceId));
  return tools;
}

/**
 * Whether a session gets the browser tool. A host without the pack still gets
 * it when the pack can be installed: the download starts now, so the pack is
 * usually ready by the first call, and that call waits for it if not.
 */
export async function isBrowserAutomationAvailable(runtime: RuntimeBackend): Promise<boolean> {
  if (!runtime.capabilities.browserAutomation) return false;
  if (runtime.backend !== 'host') return true;
  const status = await browserPackStatus();
  if (status.state === 'ready') return true;
  if (status.state === 'missing' || status.error?.installable === false) return false;
  void ensureBrowserPackForAgent(runtime.workspaceId).catch(() => undefined);
  return true;
}
