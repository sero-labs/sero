/**
 * Container-proxied tool definitions for agent sessions.
 *
 * These replace Pi SDK's createCodingTools() — every tool executes
 * inside the workspace's container via `container exec`, except `sero-cli`
 * which routes to host-side Sero commands.
 */

import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';
import { createBash, createRead, createWrite, createEdit } from './tools-coding';
import { createBrowser } from './tools-browser';
import { createWorkspaceCliTool } from '@electron/cli';

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
): Promise<ToolDefinition[]> {
  const tools = [
    createBash(runtime, runtimeCwd, sessionId),
    createRead(runtime, runtimeCwd),
    createWrite(runtime, runtimeCwd),
    createEdit(runtime, runtimeCwd),
    createWorkspaceCliTool(runtime.workspaceId, sessionId),
  ];
  if (await isBrowserAutomationAvailable(runtime)) tools.push(createBrowser(runtime, runtime.workspaceId));
  return tools;
}

async function isBrowserAutomationAvailable(runtime: RuntimeBackend): Promise<boolean> {
  if (!runtime.capabilities.browserAutomation) return false;
  if (runtime.backend !== 'host') return true;
  const health = await runtime.health();
  const browserCheck = health.checks?.find((check) => check.id === 'runtime.host.browser');
  return browserCheck?.status === 'pass' || browserCheck?.details?.installState === 'ready';
}
