import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
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

interface ExecFileSuccess {
  stdout: string | Buffer;
  stderr: string | Buffer;
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

export async function runCommand(
  label: string,
  command: string,
  args: string[],
  options: OpenShellCommandOptions = {},
): Promise<OpenShellCommandResult> {
  try {
    const result = (await execFileAsync(command, args, {
      cwd: options.cwd,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER_BYTES,
    })) as ExecFileSuccess;
    return {
      stdout: toText(result.stdout),
      stderr: toText(result.stderr),
      exitCode: 0,
    };
  } catch (error) {
    return normalizeProcessFailure(label, command, args, error);
  }
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
  const invocation = [command, ...args].join(' ');
  const reason = getFailureReason(failure);
  const lines = [`${label} failed: ${invocation}${reason ? ` (${reason})` : ''}.`];
  if (stderr.length > 0) lines.push(`stderr: ${stderr}`);
  if (stdout.length > 0) lines.push(`stdout: ${stdout}`);
  return lines.join('\n');
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
