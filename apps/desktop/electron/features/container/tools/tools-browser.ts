import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { ContainerManager } from '..';
import { createAgentBrowser } from './tools-browser-agent';

export function createBrowser(
  cm: ContainerManager,
  workspaceId: string,
): ToolDefinition {
  return createAgentBrowser(cm, workspaceId);
}
