import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';

const OUTPUT_SNIPPET_BYTES = 4000;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

export interface OpenShellCommandOptions {
  cwd?: string;
  timeoutMs?: number;
}

export interface OpenShellCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ProcessFailureLike {
  code?: string | number | null;
  signal?: string | null;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  message?: string;
}

export async function runOpenShell(
  args: string[],
  options: OpenShellCommandOptions = {},
): Promise<OpenShellCommandResult> {
  return runCommand('openshell command', 'openshell', args, options);
}

export function spawnOpenShell(
  args: string[],
  options: OpenShellCommandOptions = {},
): ChildProcessWithoutNullStreams {
  return spawn('openshell', args, {
    cwd: options.cwd,
    stdio: 'pipe',
  });
}

export function runCommand(
  label: string,
  command: string,
  args: string[],
  options: OpenShellCommandOptions = {},
): Promise<OpenShellCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes <= MAX_BUFFER_BYTES) stdoutChunks.push(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes <= MAX_BUFFER_BYTES) stderrChunks.push(chunk);
    });

    child.once('error', (error: Error & { code?: string }) => {
      resolveOnce({
        code: error.code,
        message: error.message,
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks),
      });
    });

    child.once('exit', (code, signal) => {
      const stdout = Buffer.concat(stdoutChunks);
      const stderr = Buffer.concat(stderrChunks);
      if (code === 0 && !signal && !timedOut && stdoutBytes <= MAX_BUFFER_BYTES && stderrBytes <= MAX_BUFFER_BYTES) {
        resolveSuccess(stdout, stderr);
        return;
      }
      const overflow = getOverflowMessage(stdoutBytes, stderrBytes);
      resolveOnce({
        code,
        signal,
        stdout,
        stderr: appendMessage(stderr, overflow),
        message: timedOut ? `timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms` : undefined,
      });
    });

    function resolveSuccess(stdout: Buffer, stderr: Buffer): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ stdout: toText(stdout), stderr: toText(stderr), exitCode: 0 });
    }

    function resolveOnce(failure: ProcessFailureLike): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(normalizeProcessFailure(label, command, args, failure));
    }
  });
}

export function normalizeProcessFailure(
  label: string,
  command: string,
  args: string[],
  error: unknown,
): OpenShellCommandResult {
  const failure = toProcessFailure(error);
  const stdout = sanitizeOutput(toText(failure.stdout));
  const stderr = sanitizeOutput(toText(failure.stderr));
  const exitCode = typeof failure.code === 'number' ? failure.code : 1;
  const message = formatProcessFailure(label, command, args, failure, stdout, stderr);

  return { stdout, stderr: message, exitCode };
}

export function formatOpenShellFailure(label: string, result: OpenShellCommandResult): string {
  return formatResultFailure(label, result);
}

export function formatResultFailure(label: string, result: OpenShellCommandResult): string {
  const lines = [`${label} failed with exit code ${result.exitCode}.`];
  const stderr = sanitizeOutput(result.stderr);
  const stdout = sanitizeOutput(result.stdout);
  if (stderr.length > 0) lines.push(`stderr: ${stderr}`);
  if (stdout.length > 0) lines.push(`stdout: ${stdout}`);
  return lines.join('\n');
}

export function sanitizeOutput(value: string): string {
  return limitOutputSnippet(value.replace(/\0/g, '').trim());
}

function formatProcessFailure(
  label: string,
  command: string,
  args: string[],
  failure: ProcessFailureLike,
  stdout: string,
  stderr: string,
): string {
  const invocation = formatSafeInvocation(command, args);
  const reason = getFailureReason(failure);
  const lines = [`${label} failed: ${invocation}${reason ? ` (${reason})` : ''}.`];
  if (stderr.length > 0) lines.push(`stderr: ${stderr}`);
  if (stdout.length > 0) lines.push(`stdout: ${stdout}`);
  return lines.join('\n');
}

function formatSafeInvocation(command: string, args: string[]): string {
  return [command, ...redactSensitiveArgs(args)].join(' ');
}

function redactSensitiveArgs(args: string[]): string[] {
  const redacted: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const previousArg = index > 0 ? args[index - 1] : undefined;
    if (previousArg === '-lc') {
      redacted.push('[redacted shell command]');
      continue;
    }
    redacted.push(arg);
  }
  return redacted;
}

function getFailureReason(failure: ProcessFailureLike): string {
  if (failure.code === 'ENOENT') return 'command not found';
  if (typeof failure.code === 'number') return `exit code ${failure.code}`;
  if (failure.signal) return `signal ${failure.signal}`;
  return sanitizeOutput(failure.message ?? 'process failed');
}

function toProcessFailure(error: unknown): ProcessFailureLike {
  if (typeof error === 'object' && error !== null) {
    return error as ProcessFailureLike;
  }
  return { message: String(error) };
}

function toText(value: string | Buffer | undefined): string {
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return value ?? '';
}

function limitOutputSnippet(value: string): string {
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.byteLength <= OUTPUT_SNIPPET_BYTES) return value;
  return `${buffer.subarray(0, OUTPUT_SNIPPET_BYTES).toString('utf8')}…`;
}

function appendMessage(stderr: Buffer, message: string | undefined): Buffer {
  if (!message) return stderr;
  const separator = stderr.byteLength > 0 ? '\n' : '';
  return Buffer.concat([stderr, Buffer.from(`${separator}${message}`)]);
}

function getOverflowMessage(stdoutBytes: number, stderrBytes: number): string | undefined {
  if (stdoutBytes <= MAX_BUFFER_BYTES && stderrBytes <= MAX_BUFFER_BYTES) return undefined;
  return `Output exceeded ${MAX_BUFFER_BYTES} bytes and was truncated.`;
}
