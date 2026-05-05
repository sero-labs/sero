import {
  formatOpenShellFailure,
  runOpenShell,
  type OpenShellCommandResult,
} from './cli';
import {
  getUnsupportedRemoteGatewayResult,
  hasSupportedSshDestination,
  type OpenShellRemoteCheckStatus,
  type OpenShellRemoteGatewayTarget,
} from './remote-ssh';
import type { OpenShellRemoteGatewayEntry } from './remote-gateway-registry';

export interface OpenShellRemoteGatewayCommandResult {
  ok: boolean;
  status: OpenShellRemoteCheckStatus;
  message: string;
  result?: OpenShellCommandResult;
}

export interface OpenShellRemoteGatewayLatencyResult {
  ok: boolean;
  status: OpenShellRemoteCheckStatus;
  message: string;
  latencyMs?: number;
  result?: OpenShellCommandResult;
}

export async function startRemoteGateway(
  entry: OpenShellRemoteGatewayTarget,
): Promise<OpenShellRemoteGatewayCommandResult> {
  if (!hasSupportedSshDestination(entry)) return getUnsupportedRemoteGatewayResult();

  const start = await runOpenShell([
    'gateway', 'start',
    '--name', entry.name,
    '--remote', entry.sshHost,
    ...(entry.sshKeyPath ? ['--ssh-key', entry.sshKeyPath] : []),
    '--port', String(entry.port),
    ...(entry.gatewayHost ? ['--gateway-host', entry.gatewayHost] : []),
  ], { timeoutMs: 120_000 });

  if (start.exitCode !== 0) {
    return {
      ok: false,
      status: 'unavailable',
      message: formatOpenShellFailure('start OpenShell Remote gateway', start),
      result: start,
    };
  }

  const select = await selectRemoteGateway(entry.name);
  if (!select.ok) return select;

  return {
    ok: true,
    status: 'ready',
    message: `OpenShell Remote gateway ${entry.name} is started and selected.`,
    result: select.result,
  };
}

export async function selectRemoteGateway(name: string): Promise<OpenShellRemoteGatewayCommandResult> {
  const result = await runOpenShell(['gateway', 'select', name], { timeoutMs: 10_000 });
  if (result.exitCode === 0) {
    return {
      ok: true,
      status: 'ready',
      message: `OpenShell gateway ${name} selected.`,
      result,
    };
  }

  return {
    ok: false,
    status: 'unavailable',
    message: formatOpenShellFailure(`select OpenShell gateway ${name}`, result),
    result,
  };
}

export async function getRemoteGatewayStatus(
  entry: Pick<OpenShellRemoteGatewayEntry, 'name'>,
): Promise<OpenShellRemoteGatewayCommandResult> {
  const result = await runOpenShell(['--gateway', entry.name, 'status'], { timeoutMs: 10_000 });
  if (result.exitCode === 0) {
    return {
      ok: true,
      status: 'ready',
      message: result.stdout.trim() || `OpenShell Remote gateway ${entry.name} is reachable.`,
      result,
    };
  }

  return {
    ok: false,
    status: 'unavailable',
    message: formatOpenShellFailure(`check OpenShell Remote gateway ${entry.name} status`, result),
    result,
  };
}

export async function measureRemoteGatewayLatency(
  entry: Pick<OpenShellRemoteGatewayEntry, 'name'>,
): Promise<OpenShellRemoteGatewayLatencyResult> {
  const startedAt = Date.now();
  const status = await getRemoteGatewayStatus(entry);
  if (!status.ok) return status;

  return {
    ok: true,
    status: 'ready',
    message: status.message,
    latencyMs: Date.now() - startedAt,
    result: status.result,
  };
}
