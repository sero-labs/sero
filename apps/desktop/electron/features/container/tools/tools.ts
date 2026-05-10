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
export function createRuntimeTools(
  runtime: RuntimeBackend,
  sessionId: string,
  runtimeCwd?: string,
): ToolDefinition[] {
  const tools = [
    createBash(runtime, runtimeCwd),
    createRead(runtime, runtimeCwd),
    createWrite(runtime, runtimeCwd),
    createEdit(runtime, runtimeCwd),
    createWorkspaceCliTool(runtime.workspaceId, sessionId),
  ];
  if (runtime.capabilities.browserAutomation) tools.push(createBrowser(runtime, runtime.workspaceId));
  return tools;
}
