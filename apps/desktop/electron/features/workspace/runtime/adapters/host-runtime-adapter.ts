import { execFile } from 'child_process';
import { promisify } from 'util';

import type { ExecResult } from '@electron/features/container/core/types';
import type { TerminalManager } from '@electron/features/container/terminal';
import type {
  RuntimeCapabilities,
  RuntimeExecOptions,
  RuntimeHealth,
  RuntimeTerminalInput,
  RuntimeTerminalSession,
  WorkspaceRuntimeFacade,
} from '../types';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

export const HOST_RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  exec: true,
  interactiveTerminal: true,
  directFileRead: true,
  directFileWrite: true,
  managedDevServers: false,
  browserAutomation: false,
  portDiscovery: false,
};

type HostRuntimeAdapter = Pick<
  WorkspaceRuntimeFacade,
  'providerId' | 'actualRuntime' | 'capabilities' | 'health' | 'exec' | 'createTerminal'
>;

interface HostRuntimeAdapterInput {
  workspaceId: string;
  workspacePath: string;
  terminals: TerminalManager;
}

interface ExecFileFailure {
  code?: unknown;
  stdout?: unknown;
  stderr?: unknown;
  message?: unknown;
}

export function createHostRuntimeAdapter(input: HostRuntimeAdapterInput): HostRuntimeAdapter {
  return {
    providerId: 'host',
    actualRuntime: 'host',
    capabilities: HOST_RUNTIME_CAPABILITIES,
    async health(): Promise<RuntimeHealth> {
      return { providerId: 'host', status: 'ready' };
    },
    async exec(command: string, options: RuntimeExecOptions): Promise<ExecResult> {
      try {
        const { stdout, stderr } = await execFileAsync('sh', ['-c', command], {
          cwd: options.cwd,
          timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          maxBuffer: MAX_BUFFER_BYTES,
        });
        return { stdout, stderr, exitCode: 0 };
      } catch (error: unknown) {
        return normalizeExecFailure(error);
      }
    },
    async createTerminal(options: RuntimeTerminalInput): Promise<RuntimeTerminalSession> {
      const pty = input.terminals.createHostTerminal(
        input.workspaceId,
        options.terminalId,
        input.workspacePath,
        options.cols,
        options.rows,
      );
      return { pty, runtime: 'host' };
    },
  };
}

export function normalizeExecFailure(error: unknown): ExecResult {
  const failure = error as ExecFileFailure;
  return {
    stdout: String(failure.stdout ?? ''),
    stderr: String(failure.stderr ?? failure.message ?? 'command failed'),
    exitCode: typeof failure.code === 'number' ? failure.code : 1,
  };
}
