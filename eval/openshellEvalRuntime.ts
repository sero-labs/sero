import { spawn } from 'node:child_process';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

export type OpenShellEvalProviderId = 'openshell-local' | 'openshell-remote' | 'openshell-cloud';

type RetainSandboxMode = boolean | 'always' | 'failed';

export interface OpenShellEvalRuntimeConfig {
  providerId?: OpenShellEvalProviderId;
  gatewayName?: string;
  cloudEndpoint?: string;
  timeoutMs?: number;
  sandboxNamePrefix?: string;
  retainSandboxes?: RetainSandboxMode;
  resultsDir?: string;
  gpuProfile?: boolean;
}

interface OpenShellCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface OpenShellEvalCommandRecord {
  command: string;
  cwd: string;
  runtimeCwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface OpenShellEvalMetadata {
  providerId: OpenShellEvalProviderId;
  gatewayName: string;
  sandboxName: string;
  runtimeWorkspacePath: string;
  resultsPath: string;
  artifactPath?: string;
  retainedSandbox: boolean;
  gpuProfile: boolean;
  commands: OpenShellEvalCommandRecord[];
  logLines: string[];
  cleanupError?: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_CAPTURED_OUTPUT_BYTES = 120_000;
const MAX_LOG_LINES = 300;

export class OpenShellEvalRuntime {
  readonly providerId: OpenShellEvalProviderId;
  readonly gatewayName: string;
  readonly sandboxName: string;
  readonly runtimeWorkspacePath: string;

  private ensured = false;
  private retainedSandbox = false;
  private cleanupError: string | undefined;
  private readonly commands: OpenShellEvalCommandRecord[] = [];
  private readonly logLines: string[] = [];
  private logProcess: ReturnType<typeof spawn> | null = null;

  constructor(
    private readonly workspacePath: string,
    private readonly workspaceId: string,
    private readonly config: OpenShellEvalRuntimeConfig = {},
  ) {
    this.providerId = resolveProviderId(config.providerId);
    this.gatewayName = resolveGatewayName(this.providerId, config.gatewayName);
    this.sandboxName = buildSandboxName(config.sandboxNamePrefix, workspaceId);
    this.runtimeWorkspacePath = `/sandbox/workspace/${basename(workspacePath)}`;
  }

  createBashOperations() {
    return {
      exec: async (
        command: string,
        cwd: string,
        options: { onData: (data: Buffer) => void; timeout?: number },
      ) => this.exec(command, cwd, options),
    };
  }

  async exec(
    command: string,
    cwd: string,
    options: { onData: (data: Buffer) => void; timeout?: number },
  ): Promise<{ exitCode: number | null }> {
    const runtimeCwd = this.toRuntimeCwd(cwd);
    if (!runtimeCwd) {
      const message = `Cannot run OpenShell eval command outside workspace root: ${cwd}\n`;
      options.onData(Buffer.from(message));
      return { exitCode: 1 };
    }

    const startedAt = Date.now();
    const timeoutMs = options.timeout ? options.timeout * 1000 : this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    await this.ensureReady(timeoutMs);
    options.onData(Buffer.from(
      `[OpenShell eval runtime: provider=${this.providerId}, gateway=${this.gatewayName}, sandbox=${this.sandboxName}]\n`,
    ));

    const push = await this.run(['sandbox', 'upload', this.sandboxName, this.workspacePath, this.runtimeWorkspacePath], timeoutMs);
    if (push.exitCode !== 0) return this.finishFailedCommand(command, cwd, runtimeCwd, push, startedAt, options.onData);

    const result = await this.run([
      'sandbox', 'exec', '-n', this.sandboxName,
      '--workdir', runtimeCwd,
      '--timeout', String(toTimeoutSeconds(timeoutMs)),
      '--no-tty', '--', ...toExecCommand(command),
    ], timeoutMs);

    const pull = await this.run(['sandbox', 'download', this.sandboxName, this.runtimeWorkspacePath, this.workspacePath], timeoutMs);
    const finalResult = pull.exitCode === 0 ? result : combineFailedPull(result, pull);

    return this.finishCommand(command, cwd, runtimeCwd, finalResult, startedAt, options.onData);
  }

  async finish(input: { failed: boolean; output?: string; error?: string }): Promise<OpenShellEvalMetadata> {
    this.stopLogCapture();

    const destroySandbox = this.shouldDestroySandbox(input.failed);
    this.retainedSandbox = !destroySandbox;
    const metadata = this.getMetadata();
    const artifactPath = await this.writeArtifacts(input, metadata);

    if (destroySandbox) await this.destroySandbox();

    return this.getMetadata(artifactPath);
  }

  getWorkspaceRuntimeConfig(): Record<string, unknown> {
    return {
      providerId: this.providerId,
      experimental: true,
      gatewayName: this.gatewayName,
      sandboxName: this.sandboxName,
      runtimeWorkspacePath: this.runtimeWorkspacePath,
      policyProfileId: this.config.gpuProfile ? 'gpu-agent' : 'dev',
    };
  }

  getMetadata(artifactPath?: string): OpenShellEvalMetadata {
    return {
      providerId: this.providerId,
      gatewayName: this.gatewayName,
      sandboxName: this.sandboxName,
      runtimeWorkspacePath: this.runtimeWorkspacePath,
      resultsPath: this.resultsPath(),
      artifactPath,
      retainedSandbox: this.retainedSandbox,
      gpuProfile: Boolean(this.config.gpuProfile),
      commands: [...this.commands],
      logLines: [...this.logLines],
      cleanupError: this.cleanupError,
    };
  }

  private async ensureReady(timeoutMs: number): Promise<void> {
    if (this.ensured) return;

    if (this.providerId === 'openshell-local') {
      await assertOk(this.runWithoutGateway(['gateway', 'start', '--name', this.gatewayName], timeoutMs), 'start OpenShell eval gateway');
      await assertOk(this.runWithoutGateway(['gateway', 'select', this.gatewayName], timeoutMs), 'select OpenShell eval gateway');
    } else if (this.providerId === 'openshell-cloud' && this.config.cloudEndpoint) {
      await assertOk(
        this.runWithoutGateway(['gateway', 'add', this.config.cloudEndpoint, '--name', this.gatewayName], timeoutMs),
        'register OpenShell eval cloud gateway',
      );
    }

    await assertOk(this.run(['status'], 10_000), 'check OpenShell eval gateway');

    const existing = await this.run(['sandbox', 'get', this.sandboxName], 30_000);
    if (existing.exitCode !== 0) {
      await assertOk(
        this.run(['sandbox', 'create', '--name', this.sandboxName, '--no-tty', '--', 'true'], timeoutMs),
        'create OpenShell eval sandbox',
      );
    }

    this.ensured = true;
    this.startLogCapture();
  }

  private toRuntimeCwd(cwd: string): string | null {
    const rel = relative(this.workspacePath, cwd);
    if (rel.startsWith('..') || rel === '..' || rel.includes(`..${sep}`)) return null;
    if (rel === '') return this.runtimeWorkspacePath;
    return `${this.runtimeWorkspacePath}/${rel.split(sep).join('/')}`;
  }

  private finishFailedCommand(
    command: string,
    cwd: string,
    runtimeCwd: string,
    result: OpenShellCommandResult,
    startedAt: number,
    onData: (data: Buffer) => void,
  ): { exitCode: number } {
    return this.finishCommand(command, cwd, runtimeCwd, result, startedAt, onData);
  }

  private finishCommand(
    command: string,
    cwd: string,
    runtimeCwd: string,
    result: OpenShellCommandResult,
    startedAt: number,
    onData: (data: Buffer) => void,
  ): { exitCode: number } {
    if (result.stdout) onData(Buffer.from(result.stdout));
    if (result.stderr) onData(Buffer.from(result.stderr));

    this.commands.push({
      command,
      cwd,
      runtimeCwd,
      exitCode: result.exitCode,
      stdout: limitBytes(sanitize(result.stdout)),
      stderr: limitBytes(sanitize(result.stderr)),
      durationMs: Date.now() - startedAt,
    });

    return { exitCode: result.exitCode };
  }

  private startLogCapture(): void {
    if (this.logProcess) return;
    const child = spawn('openshell', ['--gateway', this.gatewayName, 'logs', this.sandboxName, '--tail'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.logProcess = child;
    child.stdout.on('data', (chunk: Buffer) => this.captureLog(chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => this.captureLog(chunk.toString('utf8')));
    child.on('error', (error) => this.captureLog(`log stream error: ${error.message}`));
  }

  private stopLogCapture(): void {
    if (!this.logProcess) return;
    if (!this.logProcess.killed) this.logProcess.kill();
    this.logProcess = null;
  }

  private captureLog(text: string): void {
    const lines = sanitize(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    this.logLines.push(...lines);
    while (this.logLines.length > MAX_LOG_LINES) this.logLines.shift();
  }

  private async writeArtifacts(
    input: { failed: boolean; output?: string; error?: string },
    metadata: OpenShellEvalMetadata,
  ): Promise<string> {
    const artifactPath = join(this.resultsPath(), this.sandboxName);
    await mkdir(artifactPath, { recursive: true });
    if (input.failed) {
      await cp(this.workspacePath, join(artifactPath, 'workspace-snapshot'), {
        recursive: true,
        force: true,
      });
    }
    await writeFile(
      join(artifactPath, 'result.json'),
      `${JSON.stringify({ ...input, metadata }, null, 2)}\n`,
      'utf8',
    );
    return artifactPath;
  }

  private shouldDestroySandbox(failed: boolean): boolean {
    const retain = this.config.retainSandboxes;
    if (retain === true || retain === 'always') return false;
    if (retain === 'failed' && failed) return false;
    return true;
  }

  private async destroySandbox(): Promise<void> {
    if (!this.ensured) return;
    const result = await this.run(['sandbox', 'delete', this.sandboxName], this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (result.exitCode !== 0) this.cleanupError = result.stderr || result.stdout || `exit ${result.exitCode}`;
  }

  private resultsPath(): string {
    return this.config.resultsDir ?? join(process.cwd(), 'eval', 'output', 'openshell');
  }

  private run(args: string[], timeoutMs: number): Promise<OpenShellCommandResult> {
    return runOpenShell(['--gateway', this.gatewayName, ...args], timeoutMs);
  }

  private runWithoutGateway(args: string[], timeoutMs: number): Promise<OpenShellCommandResult> {
    return runOpenShell(args, timeoutMs);
  }
}

export function buildOpenShellEvalPromptBlock(config: OpenShellEvalRuntimeConfig | undefined): string {
  if (!config) return '';
  const providerId = resolveProviderId(config.providerId);
  return `\n\n## OpenShell eval runtime\n\nThis eval uses a fresh ${providerId} sandbox for the current case. Use the bash tool for runtime-visible file inspection and mutation. The regular read/write/edit file tools are intentionally unavailable in this OpenShell eval mode until first-class runtime-backed file tools exist. Every bash command is uploaded to the sandbox before execution and downloaded back afterward.\n`;
}

function resolveProviderId(providerId: OpenShellEvalRuntimeConfig['providerId']): OpenShellEvalProviderId {
  const value = providerId ?? process.env.SERO_EVAL_OPENSHELL_PROVIDER ?? 'openshell-local';
  if (value === 'openshell-local' || value === 'openshell-remote' || value === 'openshell-cloud') return value;
  throw new Error(`Unsupported OpenShell eval provider: ${value}`);
}

function resolveGatewayName(providerId: OpenShellEvalProviderId, configuredGatewayName: string | undefined): string {
  const gatewayName = configuredGatewayName ?? process.env.SERO_EVAL_OPENSHELL_GATEWAY;
  if (gatewayName) return gatewayName;
  if (providerId === 'openshell-local') return 'sero-local';
  throw new Error(`OpenShell eval provider ${providerId} requires config.gatewayName or SERO_EVAL_OPENSHELL_GATEWAY.`);
}

function buildSandboxName(prefix: string | undefined, workspaceId: string): string {
  const safePrefix = (prefix ?? 'sero-eval').replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  const safeWorkspace = workspaceId.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return `${safePrefix || 'sero-eval'}-${safeWorkspace || 'case'}-${randomUUID().slice(0, 8)}`;
}

function toExecCommand(command: string): string[] {
  const encodedCommand = Buffer.from(command, 'utf8').toString('base64');
  return ['sh', '-lc', `eval "$(printf %s '${encodedCommand}' | base64 -d)"`];
}

function toTimeoutSeconds(timeoutMs: number): number {
  if (timeoutMs === 0) return 0;
  return Math.max(1, Math.ceil(timeoutMs / 1000));
}

async function assertOk(resultPromise: Promise<OpenShellCommandResult>, label: string): Promise<void> {
  const result = await resultPromise;
  if (result.exitCode !== 0) {
    throw new Error(sanitize(`${label} failed with exit code ${result.exitCode}. ${result.stderr || result.stdout}`.trim()));
  }
}

function combineFailedPull(exec: OpenShellCommandResult, pull: OpenShellCommandResult): OpenShellCommandResult {
  return {
    stdout: exec.stdout,
    stderr: `${exec.stderr}\nPull workspace from OpenShell eval sandbox failed: ${pull.stderr || pull.stdout}`.trim(),
    exitCode: pull.exitCode,
  };
}

function runOpenShell(args: string[], timeoutMs: number): Promise<OpenShellCommandResult> {
  return new Promise((resolve) => {
    const child = spawn('openshell', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.on('error', (error: Error & { code?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ stdout: '', stderr: error.code === 'ENOENT' ? 'OpenShell CLI not found.' : error.message, exitCode: 1 });
    });
    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      resolve({
        stdout,
        stderr: signal ? `${stderr}\nOpenShell command terminated by ${signal}`.trim() : stderr,
        exitCode: code ?? 1,
      });
    });
  });
}

function limitBytes(value: string): string {
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.byteLength <= MAX_CAPTURED_OUTPUT_BYTES) return value;
  return `${buffer.subarray(0, MAX_CAPTURED_OUTPUT_BYTES).toString('utf8')}\n[truncated OpenShell eval output]`;
}

function sanitize(value: string): string {
  return value
    .replace(/\b((?:authorization|proxy-authorization)\s*:\s*)(?:bearer|basic)\s+\S+/gi, '$1[redacted]')
    .replace(/\bbearer\s+\S+/gi, 'bearer [redacted]')
    .replace(/\b((?:token|api[-_]?key|password|passwd|secret|credential)\b\s*[:=])\s*\S+/gi, '$1[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-jwt]');
}
