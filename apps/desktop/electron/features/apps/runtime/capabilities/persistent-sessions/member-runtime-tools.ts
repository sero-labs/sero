import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { createBrowser } from '@electron/features/container/tools/tools-browser';
import { createBash } from '@electron/features/container/tools/tools-coding';
import { isBrowserAutomationAvailable } from '@electron/features/container/tools/tools';
import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';

/** Use the workspace runtime for capabilities left by grant and permission filters. */
export async function createMemberRuntimeTools(
  workspaceId: string, allowedTools: string[], cwd?: string, cliScopeId?: string,
): Promise<ToolDefinition[]> {
  if (!allowedTools.some((name) => name === 'bash' || name === 'automation_browser')) return [];
  const runtime = await runtimeManager.getRuntime(workspaceId);
  await runtime.ensure();
  const tools: ToolDefinition[] = [];
  // Keep native dependencies on the same toolchain as Workflow and preview commands.
  if (allowedTools.includes('bash')) tools.push(createBash(runtime, cwd, cliScopeId));
  if (allowedTools.includes('automation_browser')) {
    if (!await isBrowserAutomationAvailable(runtime)) {
      throw new Error(`The approved automation browser is unavailable in workspace ${workspaceId}.`);
    }
    tools.push(createBrowser(runtime, workspaceId));
  }
  return tools;
}
