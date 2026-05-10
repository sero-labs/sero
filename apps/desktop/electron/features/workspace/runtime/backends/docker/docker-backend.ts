import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { buildWorkspaceContainerConfig } from '@electron/features/container/core/workspace-container-config';
import type { ContainerConfig } from '@electron/features/container/core/types';
import { DEFAULT_IMAGE } from '@electron/features/container/core/types';
import { getRuntimeCapabilities } from '../../capabilities';
import { RUNTIME_WORKSPACE_PATH } from '../../runtime-paths';
import type {
  RuntimeBackend,
  RuntimeCapabilities,
  RuntimeCreateDirectoryInput,
  RuntimeCreateFileInput,
  RuntimeDeleteInput,
  RuntimeDevServer,
  RuntimeDevServerRestartInput,
  RuntimeDevServerStartInput,
  RuntimeDevServerStatus,
  RuntimeDevServerStatusInput,
  RuntimeDevServerStopInput,
  RuntimeDirectoryEntry,
  RuntimeExecInput,
  RuntimeExecResult,
  RuntimeFileReadResult,
  RuntimeFileWatch,
  RuntimeFileWatchInput,
  RuntimeForwardedPort,
  RuntimeForwardPortInput,
  RuntimeHealth,
  RuntimeListFilesInput,
  RuntimePreviewUrl,
  RuntimePreviewUrlInput,
  RuntimeProcess,
  RuntimeProcessInput,
  RuntimeReadFileInput,
  RuntimeRenameInput,
  RuntimeSession,
  RuntimeStopForwardInput,
  RuntimeTerminalInput,
  RuntimeTerminalSession,
  RuntimeWriteFileInput,
} from '../../types';
import { runDocker, spawnDocker, type DockerRunner } from './docker-cli';
import { runDockerDoctorChecks } from './docker-doctor';
import { ensureDockerImage } from './docker-image';
import { dockerContainerName, ensureDockerContainer, runtimeEnvArgs } from './docker-lifecycle';
import { DockerTerminalRegistry } from './docker-terminal';

interface DockerBackendOptions {
  workspaceId: string;
  hostWorkspacePath: string;
  workspaceManager: WorkspaceManager;
  getGitAuthEnvVars?: () => Record<string, string>;
  imageRef?: string;
  run?: DockerRunner;
}

export class DockerBackend implements RuntimeBackend {
  readonly backend = 'docker' as const;
  readonly workspaceId: string;
  readonly hostWorkspacePath: string;
  readonly runtimeWorkspacePath = RUNTIME_WORKSPACE_PATH;
  readonly workspaceAccess = 'live-mount' as const;
  readonly capabilities: RuntimeCapabilities = getRuntimeCapabilities('docker');

  private readonly workspaceManager: WorkspaceManager;
  private readonly getGitAuthEnvVars?: () => Record<string, string>;
  private readonly imageRef: string;
  private readonly run: DockerRunner;
  private readonly terminals = new DockerTerminalRegistry();
  private ensureInflight: Promise<RuntimeSession> | null = null;

  constructor(options: DockerBackendOptions) {
    this.workspaceId = options.workspaceId;
    this.hostWorkspacePath = options.hostWorkspacePath;
    this.workspaceManager = options.workspaceManager;
    this.getGitAuthEnvVars = options.getGitAuthEnvVars;
    this.imageRef = options.imageRef ?? DEFAULT_IMAGE;
    this.run = options.run ?? runDocker;
  }

  async health(): Promise<RuntimeHealth> {
    const checks = await runDockerDoctorChecks({ imageRef: this.imageRef, run: this.run });
    const failing = checks.find((check) => check.status === 'fail');
    if (failing) {
      return { backend: this.backend, status: failing.id.endsWith('.cli') ? 'missing' : 'error', message: failing.message, checks };
    }
    const warning = checks.find((check) => check.status === 'warn');
    return { backend: this.backend, status: 'ready', message: warning?.message ?? 'Docker runtime is ready.', checks };
  }

  async ensure(): Promise<RuntimeSession> {
    if (this.ensureInflight) return this.ensureInflight;
    this.ensureInflight = this.ensureOnce().finally(() => { this.ensureInflight = null; });
    return this.ensureInflight;
  }

  async destroy(): Promise<void> {
    this.terminals.disposeAll();
    await this.run(['rm', '-f', dockerContainerName(this.workspaceId)], { timeoutMs: 30_000 });
  }

  async exec(input: RuntimeExecInput): Promise<RuntimeExecResult> {
    await this.ensure();
    const env = { ...(input.env ?? {}) };
    if (input.injectGitAuth && this.getGitAuthEnvVars) Object.assign(env, this.getGitAuthEnvVars());
    const args = [
      'exec', '-w', input.cwd ?? this.runtimeWorkspacePath,
      ...runtimeEnvArgs(env),
      dockerContainerName(this.workspaceId), 'sh', '-lc', input.command,
    ];
    return this.run(args, { timeoutMs: input.timeoutMs ?? 120_000 });
  }

  async spawn(input: RuntimeProcessInput): Promise<RuntimeProcess> {
    await this.ensure();
    const env = { ...(input.env ?? {}) };
    if (input.injectGitAuth && this.getGitAuthEnvVars) Object.assign(env, this.getGitAuthEnvVars());
    const child = spawnDocker([
      'exec', '-i', '-w', input.cwd ?? this.runtimeWorkspacePath,
      ...runtimeEnvArgs(env), dockerContainerName(this.workspaceId), 'sh', '-lc', input.command,
    ]);
    const dataCallbacks = new Set<(chunk: string) => void>();
    const exitCallbacks = new Set<(exit: { exitCode: number | null; signal?: string }) => void>();
    child.stdout?.on('data', (chunk: Buffer) => emitData(dataCallbacks, chunk));
    child.stderr?.on('data', (chunk: Buffer) => emitData(dataCallbacks, chunk));
    child.on('exit', (exitCode, signal) => {
      for (const cb of exitCallbacks) cb({ exitCode, signal: signal ?? undefined });
    });
    return {
      pid: child.pid,
      write: (chunk) => { child.stdin?.write(chunk); },
      signal: (signal) => { child.kill(signal); },
      onData: (cb) => subscribe(dataCallbacks, cb),
      onExit: (cb) => subscribe(exitCallbacks, cb),
    };
  }

  async readFile(input: RuntimeReadFileInput): Promise<RuntimeFileReadResult> {
    const command = input.binary ? `base64 -w0 -- ${shellQuote(input.path)}` : `cat -- ${shellQuote(input.path)}`;
    const result = await this.exec({ command });
    if (result.exitCode !== 0) throw new Error(result.stderr || `Failed to read ${input.path}`);
    return { content: result.stdout, encoding: input.binary ? 'base64' : (input.encoding ?? 'utf8') };
  }

  async writeFile(input: RuntimeWriteFileInput): Promise<void> {
    const encoded = Buffer.from(input.content, input.encoding ?? 'utf8').toString('base64');
    const mode = input.mode ? ` && chmod ${input.mode.toString(8)} -- ${shellQuote(input.path)}` : '';
    const result = await this.exec({ command: `mkdir -p -- ${shellQuote(dirname(input.path))} && printf %s ${shellQuote(encoded)} | base64 -d > ${shellQuote(input.path)}${mode}` });
    if (result.exitCode !== 0) throw new Error(result.stderr || `Failed to write ${input.path}`);
  }

  async listFiles(input: RuntimeListFilesInput): Promise<RuntimeDirectoryEntry[]> {
    const depth = input.recursive ? '' : '-maxdepth 1';
    const result = await this.exec({ command: `find ${shellQuote(input.path)} ${depth} -mindepth 1 -printf '%f\t%p\t%y\t%s\n' | head -n ${input.limit ?? 1000}` });
    if (result.exitCode !== 0) throw new Error(result.stderr || `Failed to list ${input.path}`);
    return result.stdout.trim().split('\n').filter(Boolean).map((line) => {
      const [name = '', filePath = '', typeCode = 'f', size = '0'] = line.split('\t');
      return { name, path: filePath, type: typeCode === 'd' ? 'directory' : 'file', size: Number(size) || 0 };
    });
  }

  async rename(input: RuntimeRenameInput): Promise<void> {
    await this.expectOk(`mv -- ${shellQuote(input.oldPath)} ${shellQuote(input.newPath)}`);
  }

  async delete(input: RuntimeDeleteInput): Promise<void> {
    await this.expectOk(`rm ${input.recursive ? '-rf' : '-f'} -- ${shellQuote(input.path)}`);
  }

  async createFile(input: RuntimeCreateFileInput): Promise<void> {
    if (input.overwrite === false) await this.expectOk(`test ! -e ${shellQuote(input.path)}`);
    await this.writeFile(input);
  }

  async createDirectory(input: RuntimeCreateDirectoryInput): Promise<void> {
    await this.expectOk(`mkdir ${input.recursive ? '-p ' : ''}-- ${shellQuote(input.path)}`);
  }

  async watchFiles(_input: RuntimeFileWatchInput): Promise<RuntimeFileWatch> {
    throw new Error('Docker runtime file watching is not implemented yet.');
  }

  async createTerminal(input: RuntimeTerminalInput): Promise<RuntimeTerminalSession> {
    await this.ensure();
    return this.terminals.create(this.workspaceId, input.terminalId, input.cwd ?? this.runtimeWorkspacePath, input.cols, input.rows);
  }

  async startDevServer(_input: RuntimeDevServerStartInput): Promise<RuntimeDevServer> { throw todo07(); }
  async stopDevServer(_input: RuntimeDevServerStopInput): Promise<void> { throw todo07(); }
  async restartDevServer(_input: RuntimeDevServerRestartInput): Promise<RuntimeDevServer> { throw todo07(); }
  async getDevServerStatus(_input: RuntimeDevServerStatusInput): Promise<RuntimeDevServerStatus> { return { servers: [] }; }
  async forwardPort(_input: RuntimeForwardPortInput): Promise<RuntimeForwardedPort> { throw todo07(); }
  async stopForward(_input: RuntimeStopForwardInput): Promise<void> { throw todo07(); }
  async resolvePreviewUrl(_input: RuntimePreviewUrlInput): Promise<RuntimePreviewUrl> { throw todo07(); }

  private async ensureOnce(): Promise<RuntimeSession> {
    await ensureDockerImage({ imageRef: this.imageRef, run: this.run });
    const config = await this.buildConfig();
    const state = await ensureDockerContainer({ config, imageRef: this.imageRef, run: this.run });
    return {
      backend: this.backend,
      workspaceId: this.workspaceId,
      hostWorkspacePath: this.hostWorkspacePath,
      runtimeWorkspacePath: this.runtimeWorkspacePath,
      state: state.state,
      containerId: state.id,
    };
  }

  private async buildConfig(): Promise<ContainerConfig> {
    return buildWorkspaceContainerConfig(this.workspaceManager, this.workspaceId, this.hostWorkspacePath);
  }

  private async expectOk(command: string): Promise<void> {
    const result = await this.exec({ command });
    if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || `Command failed: ${command}`);
  }
}

function dirname(filePath: string): string {
  const index = filePath.lastIndexOf('/');
  return index <= 0 ? '/' : filePath.slice(0, index);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function emitData(callbacks: Set<(chunk: string) => void>, chunk: Buffer): void {
  const text = chunk.toString();
  for (const cb of callbacks) cb(text);
}

function subscribe<T>(callbacks: Set<(value: T) => void>, cb: (value: T) => void): () => void {
  callbacks.add(cb);
  return () => callbacks.delete(cb);
}

function todo07(): Error {
  return new Error('Docker runtime preview/dev-server port management is implemented in TODO-07.');
}
