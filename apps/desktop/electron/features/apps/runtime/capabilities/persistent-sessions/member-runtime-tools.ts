import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { createBrowser } from '@electron/features/container/tools/tools-browser';
import { createBash, createEdit, createRead, createWrite } from '@electron/features/container/tools/tools-coding';
import { isBrowserAutomationAvailable } from '@electron/features/container/tools/tools';
import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';

const RUNTIME_TOOL_NAMES = ['bash', 'read', 'write', 'edit', 'automation_browser'];

/** Use the workspace runtime for capabilities left by grant and permission filters. */
export async function createMemberRuntimeTools(
  workspaceId: string, allowedTools: string[], cwd?: string, cliScopeId?: string,
): Promise<ToolDefinition[]> {
  if (!allowedTools.some((name) => RUNTIME_TOOL_NAMES.includes(name))) return [];
  const runtime = await runtimeManager.getRuntime(workspaceId);
  await runtime.ensure();
  const tools: ToolDefinition[] = [];
  // Keep native dependencies on the same toolchain as Workflow and preview commands.
  if (allowedTools.includes('bash')) tools.push(createBash(runtime, cwd, cliScopeId));
  // File tools go to the same filesystem as `bash`. Pi's own would act on the host.
  if (allowedTools.includes('read')) tools.push(createRead(runtime, cwd));
  if (allowedTools.includes('write')) tools.push(createWrite(runtime, cwd));
  if (allowedTools.includes('edit')) tools.push(createEdit(runtime, cwd));
  if (allowedTools.includes('automation_browser')) {
    if (!await isBrowserAutomationAvailable(runtime)) {
      throw new Error(`The approved automation browser is unavailable in workspace ${workspaceId}.`);
    }
    tools.push(createBrowser(runtime, workspaceId));
  }
  return tools;
}
