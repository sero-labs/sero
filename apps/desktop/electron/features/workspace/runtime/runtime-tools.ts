import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { Static } from 'typebox';
import { createWorkspaceCliTool } from '@electron/cli';
import type { ContainerManager } from '@electron/features/container';
import { containerManager } from '@electron/features/container/core/singleton';
import {
  createContainerTools,
  createHostCodingTools,
} from '@electron/features/container/tools';
import { createEdit, createRead, createWrite } from '@electron/features/container/tools/tools-coding';
import { BashParams } from '@electron/features/container/tools/tool-schemas';
import { commandTouchesProtectedMemory, getProtectedMemoryAccessError } from '@electron/features/container/tools/memory-file-guard';
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateTail } from '@electron/features/container/filesystem/truncate';
import type { WorkspaceRuntimeProviderId } from '@/types/ipc';
import type { WorkspaceRuntimeFacade } from './types';
import {
  getOpenShellRuntimeWorkspacePath,
  toOpenShellWorkspacePath,
} from './openshell/path';

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
  if (isOpenShellProvider(runtime.providerId) && !options.forceHost) {
    return [
      createRuntimeBashTool(runtime, hostCwd),
      ...createOpenShellFileTools(runtime, hostCwd),
      deps.createWorkspaceCliTool(runtime.workspaceId, options.sessionId),
    ];
  }

  const hostTools = deps.createHostCodingTools(hostCwd);
  return [
    ...hostTools,
    deps.createWorkspaceCliTool(runtime.workspaceId, options.sessionId),
  ];
}

function isOpenShellProvider(
  providerId: WorkspaceRuntimeProviderId | undefined,
): providerId is 'openshell-local' | 'openshell-remote' | 'openshell-cloud' {
  return providerId === 'openshell-local'
    || providerId === 'openshell-remote'
    || providerId === 'openshell-cloud';
}

function getOpenShellProviderLabel(
  providerId: 'openshell-local' | 'openshell-remote' | 'openshell-cloud',
): string {
  if (providerId === 'openshell-cloud') return 'OpenShell Cloud';
  return providerId === 'openshell-remote' ? 'OpenShell Remote' : 'OpenShell Local';
}

function createOpenShellFileTools(
  runtime: WorkspaceRuntimeFacade,
  hostCwd: string,
): ToolDefinition[] {
  const runtimeCwd = toOpenShellWorkspacePath(
    runtime.workspacePath,
    hostCwd,
    getOpenShellRuntimeWorkspacePath(runtime.workspacePath),
  ) ?? getOpenShellRuntimeWorkspacePath(runtime.workspacePath);
  const adapter = createOpenShellContainerToolAdapter(runtime, hostCwd);
  return [
    createRead(adapter, runtime.workspaceId, runtimeCwd),
    createWrite(adapter, runtime.workspaceId, runtimeCwd),
    createEdit(adapter, runtime.workspaceId, runtimeCwd),
  ];
}

function createOpenShellContainerToolAdapter(
  runtime: WorkspaceRuntimeFacade,
  hostCwd: string,
) {
  return {
    exec: async (
      _workspaceId: string,
      command: string,
      _cwd?: string,
      timeoutMs?: number,
    ) => runtime.exec(command, { cwd: hostCwd, timeoutMs }),
    writeFile: async (_workspaceId: string, filePath: string, content: string) => {
      const result = await runtime.exec(buildRuntimeWriteFileCommand(filePath, content), {
        cwd: hostCwd,
        timeoutMs: 120_000,
      });
      if (result.exitCode !== 0) {
        throw new Error(`Failed to write ${filePath}: ${result.stderr || result.stdout}`);
      }
    },
  };
}

function buildRuntimeWriteFileCommand(filePath: string, content: string): string {
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  return [
    "python3 - <<'PY'",
    'import base64',
    'from pathlib import Path',
    `p = Path(${JSON.stringify(filePath)})`,
    'p.parent.mkdir(parents=True, exist_ok=True)',
    `p.write_text(base64.b64decode(${JSON.stringify(encoded)}).decode('utf-8'))`,
    'PY',
  ].join('\n');
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
      const { outputText, truncation } = formatRuntimeBashOutput(result.stdout, result.stderr);
      const runtimeDetails = {
        exitCode: result.exitCode,
        providerId: runtime.providerId,
        runtime: runtime.actualRuntime,
      };

      if (result.exitCode !== 0) {
        const failurePrefix = isOpenShellProvider(runtime.providerId)
          ? `${getOpenShellProviderLabel(runtime.providerId)} runtime command failed.\n`
          : '';
        throw new Error(
          `${failurePrefix}${outputText}\n\nCommand exited with code ${result.exitCode}`,
        );
      }

      return {
        content: [{ type: 'text', text: outputText }],
        details: { ...runtimeDetails, ...(truncation.truncated ? { truncation } : {}) },
      };
    },
  };
}

function formatRuntimeBashOutput(stdout: string, stderr: string) {
  const combined = (stdout + (stderr ? '\n' + stderr : '')).trim();
  const truncation = truncateTail(combined);
  let outputText = truncation.content || '(no output)';

  if (!truncation.truncated) return { outputText, truncation };

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
  return { outputText, truncation };
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
