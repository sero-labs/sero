/**
 * Container-proxied tool definitions for agent sessions.
 *
 * These replace Pi SDK's createCodingTools() — every tool executes
 * inside the workspace's container via `container exec`, except `sero-cli`
 * which routes to host-side Sero commands.
 */

import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { ContainerManager } from './index';
import { createBash, createRead, createWrite, createEdit } from './tools-coding';
import { createWorkspaceCliTool } from '../cli';

/**
 * Build all container tools for a workspace.
 * These are passed as `customTools` to `createAgentSession()`.
 */
export function createContainerTools(
  cm: ContainerManager,
  workspaceId: string,
  sessionId: string,
): ToolDefinition[] {
  return [
    createBash(cm, workspaceId),
    createRead(cm, workspaceId),
    createWrite(cm, workspaceId),
    createEdit(cm, workspaceId),
    createWorkspaceCliTool(workspaceId, sessionId),
  ];
}
