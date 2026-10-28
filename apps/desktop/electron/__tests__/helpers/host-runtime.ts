/**
 * A real host runtime for tests that must exercise the PRODUCTION tools (#658).
 *
 * `tools-host.ts` used to give the tests their own copy of `bash`, `read`,
 * `write` and `edit`, so a fault in the tools a session actually runs could pass
 * every one of them. The fix is to run `createRuntimeTools` — which means the
 * test needs a runtime, not a substitute for the tool.
 *
 * So this is a runtime and nothing else: it reads, writes and executes on the
 * host filesystem, exactly like the host backend. Anything a test asserts is
 * therefore the production tool's behaviour.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';

import { getRuntimeCapabilities } from '@electron/features/workspace/runtime/capabilities';
import type {
  RuntimeBackend,
  RuntimeExecInput,
  RuntimeExecResult,
  RuntimeFileReadResult,
  RuntimeHealth,
  RuntimeSession,
} from '@electron/features/workspace/runtime/types';

const READY: RuntimeHealth = { backend: 'host', status: 'ready', message: 'ready' };

/**
 * Runs one command the way the host backend does: a real shell in `cwd`, with
 * output streamed to the sink when the caller asked for streaming. Streaming
 * matters — the production `bash` tool builds its payload from the capture, so a
 * runtime that only buffers would make every streaming assertion vacuous.
 */
function run(input: RuntimeExecInput, program: string, args: string[]): Promise<RuntimeExecResult> {
  return new Promise((resolve) => {
    const child = execFile(
      program,
      args,
      { cwd: input.cwd, env: { ...process.env, ...input.env }, timeout: input.timeoutMs, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          stdout,
          stderr,
          exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        });
      },
    );
    if (input.outputSink) {
      child.stdout?.on('data', (chunk: Buffer) => input.outputSink?.write('stdout', chunk));
      child.stderr?.on('data', (chunk: Buffer) => input.outputSink?.write('stderr', chunk));
    }
    input.signal?.addEventListener('abort', () => child.kill('SIGKILL'), { once: true });
  });
}

export function createHostRuntime(rootDir: string, workspaceId = 'ws-1'): RuntimeBackend {
  const capabilities = getRuntimeCapabilities(
    'host',
    process.platform === 'darwin' ? 'darwin' : 'linux',
    process.arch === 'arm64' ? 'arm64' : 'x64',
  );
  return {
    backend: 'host',
    workspaceId,
    hostWorkspacePath: rootDir,
    runtimeWorkspacePath: rootDir,
    workspaceAccess: 'host',
    // No browser pack in a unit test: the browser tool is not what these cover.
    capabilities: { ...capabilities, browserAutomation: false },
    health: vi.fn(async () => READY),
    ensure: vi.fn(async (): Promise<RuntimeSession> => ({
      backend: 'host',
      workspaceId,
      hostWorkspacePath: rootDir,
      runtimeWorkspacePath: rootDir,
      state: 'running',
    })),
    destroy: vi.fn(async () => undefined),
    exec: (input) => run(input, 'bash', ['-lc', input.command]),
    execFile: (input) => run({ command: input.program, cwd: input.cwd, timeoutMs: input.timeoutMs }, input.program, input.args),
    isSshAvailable: vi.fn(async () => false),
    spawn: vi.fn(async () => ({
      write: () => undefined,
      signal: () => undefined,
      onData: () => () => undefined,
      onExit: () => () => undefined,
    })),
    readFile: async ({ path: target, binary }): Promise<RuntimeFileReadResult> => {
      if (!binary) return { content: await fs.readFile(target, 'utf8'), encoding: 'utf8' };
      return { content: (await fs.readFile(target)).toString('base64'), encoding: 'base64' };
    },
    writeFile: async ({ path: target, content }) => fs.writeFile(target, content),
    listFiles: async ({ path: target, recursive }) => {
      const names = await fs.readdir(target, { withFileTypes: true, recursive: recursive === true });
      return names.map((entry) => ({
        name: entry.name,
        path: path.join(entry.parentPath, entry.name),
        type: entry.isDirectory() ? ('directory' as const) : ('file' as const),
        size: 0,
      }));
    },
    rename: async ({ oldPath, newPath }) => fs.rename(oldPath, newPath),
    delete: async ({ path: target, recursive }) => fs.rm(target, { recursive: recursive === true, force: true }),
    createFile: async ({ path: target, content }) => fs.writeFile(target, content, { flag: 'wx' }),
    createDirectory: async ({ path: target, recursive }) => {
      await fs.mkdir(target, { recursive: recursive === true });
    },
    watchFiles: vi.fn(async () => ({ close: async () => undefined })),
    createTerminal: vi.fn(async () => ({
      terminalId: 'terminal-1',
      write: () => undefined,
      signal: () => undefined,
      onData: () => () => undefined,
      onExit: () => () => undefined,
      replayBuffer: () => '',
    })),
    startDevServer: vi.fn(async () => ({ id: 'server-1', port: 5173, url: 'http://127.0.0.1:5173', command: 'pnpm dev', cwd: rootDir })),
    stopDevServer: vi.fn(async () => undefined),
    restartDevServer: vi.fn(async () => ({ id: 'server-1', port: 5173, url: 'http://127.0.0.1:5173', command: 'pnpm dev', cwd: rootDir })),
    getDevServerStatus: vi.fn(async () => ({ servers: [] })),
    forwardPort: vi.fn(async () => ({ targetPort: 5173, hostPort: 5173, url: 'http://127.0.0.1:5173', bridged: false })),
    stopForward: vi.fn(async () => undefined),
    resolvePreviewUrl: vi.fn(async () => ({ url: 'http://127.0.0.1:5173', targetPort: 5173, backend: 'host' as const })),
  };
}
