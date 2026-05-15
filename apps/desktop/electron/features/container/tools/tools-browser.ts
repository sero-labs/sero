import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';
import { createAgentBrowser } from './tools-browser-agent';

export function createBrowser(
  runtime: RuntimeBackend,
  workspaceId: string,
): ToolDefinition {
  return createAgentBrowser(runtime, workspaceId);
}
