/**
 * Container-proxied tool definitions for agent sessions.
 *
 * These replace Pi SDK's createCodingTools() — every tool executes
 * inside the workspace's container via `container exec`, except `sero-cli`
 * which routes to host-side Sero commands.
 */

import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { ContainerManager } from '..';
import { createBash, createRead, createWrite, createEdit } from './tools-coding';
import { createBrowser } from './tools-browser';
import { createWorkspaceCliTool } from '../../../cli';

/**
 * Build all container tools for a workspace.
 * These are passed as `customTools` to `createAgentSession()`.
 *
 * @param containerCwd — override the default `/workspace` CWD for coding tools
 *   (e.g. when running in a git worktree subdirectory).
 */
export function createContainerTools(
  cm: ContainerManager,
  workspaceId: string,
  sessionId: string,
  containerCwd?: string,
): ToolDefinition[] {
  return [
    createBash(cm, workspaceId, containerCwd),
    createRead(cm, workspaceId, containerCwd),
    createWrite(cm, workspaceId, containerCwd),
    createEdit(cm, workspaceId, containerCwd),
    createWorkspaceCliTool(workspaceId, sessionId),
    createBrowser(cm, workspaceId),
  ];
}
