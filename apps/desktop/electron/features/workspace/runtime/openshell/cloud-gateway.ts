import type { WorkspaceRuntimeConfig } from '@/types/ipc';
import type { OpenShellCloudDiagnosticsIPC } from '@sero-ai/common';

import {
  formatOpenShellFailure,
  runOpenShell,
  type OpenShellCommandResult,
} from './cli';
import type { OpenShellCloudGatewayEntry } from './cloud-gateway-registry';

export type OpenShellCloudCheckStatus = OpenShellCloudDiagnosticsIPC['status'];

export interface OpenShellCloudGatewayCommandResult {
  ok: boolean;
  status: OpenShellCloudCheckStatus;
  message: string;
  result?: OpenShellCommandResult;
}

export interface OpenShellCloudGatewayStatusResult extends OpenShellCloudGatewayCommandResult {
  latencyMs?: number;
}

export interface OpenShellCloudSandboxExistenceResult {
  exists: boolean | undefined;
  message: string;
  result?: OpenShellCommandResult;
}

const DEFAULT_IDLE_TIMEOUT_MINUTES = 60;
const REGISTER_TIMEOUT_MS = 30_000;
const LOGIN_TIMEOUT_MS = 120_000;
const STATUS_TIMEOUT_MS = 10_000;
const SANDBOX_TIMEOUT_MS = 10_000;
const AUTH_HEADER_PATTERN = /\b(?:authorization|proxy-authorization)\s*:\s*(?:bearer|basic)\s+\S+/gi;
const BEARER_VALUE_PATTERN = /\bbearer\s+\S+/gi;
const COOKIE_HEADER_PATTERN = /\b(?:set-cookie|cookie)\s*:\s*[^\r\n]+/gi;
const SECRET_VALUE_PATTERN = /\b(?:token|api[-_]?key|password|passwd|secret|credential)\b\s*[:=]\s*\S+/gi;
const COOKIE_VALUE_PATTERN = /(^|[\s;&?])cookie\s*[:=]\s*\S+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

export async function registerCloudGateway(
  entry: Pick<OpenShellCloudGatewayEntry, 'endpoint' | 'name'>,
): Promise<OpenShellCloudGatewayCommandResult> {
  const result = await runOpenShell([
    'gateway', 'add', entry.endpoint,
    '--name', entry.name,
  ], { timeoutMs: REGISTER_TIMEOUT_MS });

  if (result.exitCode === 0) {
    return {
      ok: true,
      status: 'ready',
      message: `OpenShell Cloud gateway ${entry.name} is registered.`,
      result: sanitizeResult(result),
    };
  }

  return toCloudFailure('register OpenShell Cloud gateway', result);
}

export async function loginCloudGateway(
  entry: Pick<OpenShellCloudGatewayEntry, 'name'>,
): Promise<OpenShellCloudGatewayCommandResult> {
  const result = await runOpenShell(['gateway', 'login', entry.name], { timeoutMs: LOGIN_TIMEOUT_MS });
  if (result.exitCode === 0) {
    return {
      ok: true,
      status: 'ready',
      message: `OpenShell Cloud gateway ${entry.name} login completed.`,
      result: sanitizeResult(result),
    };
  }

  return toCloudFailure(`login to OpenShell Cloud gateway ${entry.name}`, result);
}

export async function getCloudGatewayInfo(
  entry: Pick<OpenShellCloudGatewayEntry, 'name'>,
): Promise<OpenShellCloudGatewayCommandResult> {
  const result = await runOpenShell(['gateway', 'info', '--name', entry.name], { timeoutMs: STATUS_TIMEOUT_MS });
  if (result.exitCode === 0) {
    return {
      ok: true,
      status: 'ready',
      message: sanitizeDiagnosticOutput(result.stdout) || `OpenShell Cloud gateway ${entry.name} info is available.`,
      result: sanitizeResult(result),
    };
  }

  return toCloudFailure(`inspect OpenShell Cloud gateway ${entry.name}`, result);
}

export async function getCloudGatewayStatus(
  entry: Pick<OpenShellCloudGatewayEntry, 'name'>,
): Promise<OpenShellCloudGatewayStatusResult> {
  const startedAt = Date.now();
  const result = await runOpenShell(['--gateway', entry.name, 'status'], { timeoutMs: STATUS_TIMEOUT_MS });
  if (result.exitCode === 0) {
    return {
      ok: true,
      status: 'ready',
      message: sanitizeDiagnosticOutput(result.stdout) || `OpenShell Cloud gateway ${entry.name} is reachable.`,
      latencyMs: Date.now() - startedAt,
      result: sanitizeResult(result),
    };
  }

  return toCloudFailure(`check OpenShell Cloud gateway ${entry.name} status`, result);
}

export async function checkCloudSandboxExists(
  gatewayName: string,
  sandboxName: string | undefined,
): Promise<OpenShellCloudSandboxExistenceResult> {
  if (!sandboxName?.trim()) {
    return { exists: undefined, message: 'No OpenShell Cloud sandbox name is configured.' };
  }

  const result = await runOpenShell([
    '--gateway', gatewayName,
    'sandbox', 'get',
    '-n', sandboxName.trim(),
  ], { timeoutMs: SANDBOX_TIMEOUT_MS });

  if (result.exitCode === 0) {
    return {
      exists: true,
      message: sanitizeDiagnosticOutput(result.stdout) || `OpenShell Cloud sandbox ${sandboxName} exists.`,
      result: sanitizeResult(result),
    };
  }

  const output = `${result.stderr}\n${result.stdout}`;
  if (/not\s+found|missing|deleted|does\s+not\s+exist/i.test(output)) {
    return {
      exists: false,
      message: `OpenShell Cloud sandbox ${sandboxName} was not found.`,
      result: sanitizeResult(result),
    };
  }

  return {
    exists: undefined,
    message: sanitizeDiagnosticOutput(formatOpenShellFailure(`inspect OpenShell Cloud sandbox ${sandboxName}`, result)),
    result: sanitizeResult(result),
  };
}

export function isCloudSandboxStale(
  config: WorkspaceRuntimeConfig,
  now = Date.now(),
  sandboxExists: boolean | undefined = true,
): boolean {
  if (sandboxExists === false) return false;
  if (!config.lastActivityAt) return false;

  const lastActivityMs = Date.parse(config.lastActivityAt);
  if (!Number.isFinite(lastActivityMs)) return false;

  const idleTimeoutMinutes = getIdleTimeoutMinutes(config.idleTimeoutMinutes);
  return now - lastActivityMs > idleTimeoutMinutes * 60_000;
}

export async function getCloudGatewayDiagnostics(
  entry: OpenShellCloudGatewayEntry,
  config: WorkspaceRuntimeConfig,
): Promise<OpenShellCloudDiagnosticsIPC> {
  const [status, sandbox] = await Promise.all([
    getCloudGatewayStatus(entry),
    checkCloudSandboxExists(entry.name, config.sandboxName),
  ]);
  const stale = isCloudSandboxStale(config, Date.now(), sandbox.exists);
  const base = createBaseDiagnostics(entry, config, stale);

  if (stale) {
    return {
      ...base,
      status: 'stale',
      latencyMs: status.latencyMs,
      message: `OpenShell Cloud sandbox ${config.sandboxName ?? entry.name} may be stale. Last activity exceeded the configured idle timeout; destroy the sandbox to stop using cloud resources.`,
    };
  }

  if (status.ok) {
    return {
      ...base,
      status: 'ready',
      latencyMs: status.latencyMs,
      message: status.message,
    };
  }

  return {
    ...base,
    status: status.status,
    message: status.message,
  };
}

function createBaseDiagnostics(
  entry: OpenShellCloudGatewayEntry,
  config: WorkspaceRuntimeConfig,
  stale: boolean,
): Omit<OpenShellCloudDiagnosticsIPC, 'message' | 'status'> {
  return {
    gatewayId: entry.id,
    gatewayName: entry.name,
    endpoint: entry.endpoint,
    sandboxName: config.sandboxName,
    lastActivityAt: config.lastActivityAt,
    idleTimeoutMinutes: getIdleTimeoutMinutes(config.idleTimeoutMinutes),
    stale,
    resourceLabel: entry.resourceLabel,
    costLabel: entry.costLabel,
  };
}

function toCloudFailure(label: string, result: OpenShellCommandResult): OpenShellCloudGatewayCommandResult {
  const message = sanitizeDiagnosticOutput(formatOpenShellFailure(label, result));
  return {
    ok: false,
    status: isAuthFailure(result) ? 'auth-required' : 'unavailable',
    message,
    result: sanitizeResult(result),
  };
}

function isAuthFailure(result: OpenShellCommandResult): boolean {
  return /auth|login|unauthorized|forbidden|permission\s+denied|401|403/i.test(`${result.stderr}\n${result.stdout}`);
}

function getIdleTimeoutMinutes(value: number | undefined): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  return DEFAULT_IDLE_TIMEOUT_MINUTES;
}

function sanitizeResult(result: OpenShellCommandResult): OpenShellCommandResult {
  return {
    ...result,
    stdout: sanitizeDiagnosticOutput(result.stdout),
    stderr: sanitizeDiagnosticOutput(result.stderr),
  };
}

export function sanitizeDiagnosticOutput(value: string): string {
  return value
    .replace(/\0/g, '')
    .replace(AUTH_HEADER_PATTERN, (match) => `${match.split(':')[0]}: [redacted]`)
    .replace(COOKIE_HEADER_PATTERN, (match) => `${match.split(':')[0]}: [redacted]`)
    .replace(SECRET_VALUE_PATTERN, (match) => `${match.split(/[:=]/)[0]}=[redacted]`)
    .replace(COOKIE_VALUE_PATTERN, (_match, prefix: string) => `${prefix}cookie=[redacted]`)
    .replace(BEARER_VALUE_PATTERN, 'Bearer [redacted]')
    .replace(JWT_PATTERN, '[redacted-token]')
    .trim()
    .slice(0, 1_000);
}
