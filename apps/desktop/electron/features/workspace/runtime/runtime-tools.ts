import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { Static } from 'typebox';
import { createWorkspaceCliTool } from '@electron/cli';
import type { ContainerManager } from '@electron/features/container';
import { containerManager } from '@electron/features/container/core/singleton';
import {
  createContainerTools,
  createHostCodingTools,
} from '@electron/features/container/tools';
import { BashParams } from '@electron/features/container/tools/tool-schemas';
import { commandTouchesProtectedMemory, getProtectedMemoryAccessError } from '@electron/features/container/tools/memory-file-guard';
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateTail } from '@electron/features/container/filesystem/truncate';
import type { WorkspaceRuntimeFacade } from './types';

export interface RuntimeToolOptions {
  sessionId: string;
  containerCwd?: string;
  hostCwd?: string;
  forceHost?: boolean;
  deps?: Partial<RuntimeToolDependencies>;
}

interface RuntimeToolDependencies {
  containerManager: ContainerManager;
  createContainerTools(
    cm: ContainerManager,
    workspaceId: string,
    sessionId: string,
    containerCwd?: string,
  ): ToolDefinition[];
  createHostCodingTools(basedir: string): ToolDefinition[];
  createWorkspaceCliTool(workspaceId: string, sessionId: string): ToolDefinition;
}

export function createRuntimeCodingTools(
  runtime: WorkspaceRuntimeFacade,
  options: RuntimeToolOptions,
): ToolDefinition[] {
  const deps = resolveRuntimeToolDeps(options.deps);

  if (runtime.actualRuntime === 'container' && !options.forceHost) {
    return deps.createContainerTools(
      deps.containerManager,
      runtime.workspaceId,
      options.sessionId,
      options.containerCwd,
    );
  }

  const hostCwd = options.hostCwd ?? runtime.workspacePath;
  const hostTools = deps.createHostCodingTools(hostCwd);
  if (runtime.providerId === 'openshell-local' && !options.forceHost) {
    return [
      createRuntimeBashTool(runtime, hostCwd),
      ...hostTools.filter((tool) => tool.name !== 'bash'),
      deps.createWorkspaceCliTool(runtime.workspaceId, options.sessionId),
    ];
  }

  return [
    ...hostTools,
    deps.createWorkspaceCliTool(runtime.workspaceId, options.sessionId),
  ];
}

function createRuntimeBashTool(runtime: WorkspaceRuntimeFacade, cwd: string): ToolDefinition {
  return {
    name: 'bash',
    label: 'bash',
    description:
      `Execute a bash command in the workspace runtime. ` +
      `Returns stdout and stderr. Output is truncated to last ` +
      `${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB ` +
      `(whichever is hit first). Optionally provide a timeout in seconds.`,
    promptSnippet: 'Execute bash commands in the workspace runtime (ls, grep, find, etc.)',
    parameters: BashParams,
    execute: async (_toolCallId, params: Static<typeof BashParams>, signal?) => {
      if (signal?.aborted) throw new Error('Command aborted');
      if (commandTouchesProtectedMemory(params.command)) {
        throw new Error(getProtectedMemoryAccessError('bash'));
      }

      const result = await runtime.exec(params.command, {
        cwd,
        timeoutMs: params.timeout ? params.timeout * 1000 : undefined,
      });
      const outputText = formatRuntimeBashOutput(result.stdout, result.stderr);

      if (result.exitCode !== 0) {
        throw new Error(`${outputText}\n\nCommand exited with code ${result.exitCode}`);
      }

      const truncation = truncateTail(outputText === '(no output)' ? '' : outputText);
      return {
        content: [{ type: 'text', text: outputText }],
        details: { exitCode: result.exitCode, ...(truncation.truncated ? { truncation } : {}) },
      };
    },
  };
}

function formatRuntimeBashOutput(stdout: string, stderr: string): string {
  const combined = (stdout + (stderr ? '\n' + stderr : '')).trim();
  const truncation = truncateTail(combined);
  let outputText = truncation.content || '(no output)';

  if (!truncation.truncated) return outputText;

  const startLine = truncation.totalLines - truncation.outputLines + 1;
  const endLine = truncation.totalLines;
  if (truncation.lastLinePartial) {
    const lastLineSize = formatSize(
      Buffer.byteLength(combined.split('\n').pop() || '', 'utf-8'),
    );
    outputText += `\n\n[Showing last ${formatSize(truncation.outputBytes)} of line ${endLine} (line is ${lastLineSize}).]`;
  } else if (truncation.truncatedBy === 'lines') {
    outputText += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines}.]`;
  } else {
    outputText += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines} (${formatSize(DEFAULT_MAX_BYTES)} limit).]`;
  }
  return outputText;
}

function resolveRuntimeToolDeps(
  deps: Partial<RuntimeToolDependencies> = {},
): RuntimeToolDependencies {
  return {
    containerManager: deps.containerManager ?? containerManager,
    createContainerTools: deps.createContainerTools ?? createContainerTools,
    createHostCodingTools: deps.createHostCodingTools ?? createHostCodingTools,
    createWorkspaceCliTool: deps.createWorkspaceCliTool ?? createWorkspaceCliTool,
  };
}
