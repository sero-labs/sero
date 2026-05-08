import {
  formatOpenShellFailure,
  runOpenShell,
  type OpenShellCommandResult,
} from './cli';
import type { OpenShellRemoteTunnelDiagnosticCode } from './remote-tunnel';
import {
  ensureRemoteGatewayTunnel,
  getRemoteTunnelLocalEndpoint,
  getRemoteTunnelLocalPort,
} from './remote-tunnel';
import {
  getOpenShellRemoteConnectionMode,
  type OpenShellRemoteGatewayEntry,
  type OpenShellRemoteGatewayInput,
} from './remote-gateway-registry';
import {
  getUnsupportedRemoteGatewayResult,
  hasSupportedSshDestination,
  type OpenShellRemoteCheckStatus,
  type OpenShellRemoteGatewayTarget,
} from './remote-ssh';

export type OpenShellRemoteGatewayDiagnosticCode =
  | OpenShellRemoteTunnelDiagnosticCode
  | 'remote-gateway-not-listening'
  | 'openshell-status-failed';

export interface OpenShellRemoteGatewayCommandResult {
  ok: boolean;
  status: OpenShellRemoteCheckStatus;
  message: string;
  gatewayName?: string;
  localEndpoint?: string;
  localPort?: number;
  diagnosticCode?: OpenShellRemoteGatewayDiagnosticCode;
  result?: OpenShellCommandResult;
}

export interface OpenShellRemoteGatewayLatencyResult extends OpenShellRemoteGatewayCommandResult {
  latencyMs?: number;
}

export function getTunnelGatewayName(entry: Pick<OpenShellRemoteGatewayEntry, 'name' | 'port' | 'localPort'>): string {
  return `${entry.name}-ssh-tunnel-${getRemoteTunnelLocalPort(entry)}`;
}

export async function startRemoteGateway(
  entry: OpenShellRemoteGatewayTarget,
): Promise<OpenShellRemoteGatewayCommandResult> {
  const start = await startRemoteGatewayProcess(entry);
  if (!start.ok) return start;

  const select = await selectRemoteGateway(entry.name);
  if (!select.ok) return select;

  return {
    ok: true,
    status: 'ready',
    gatewayName: entry.name,
    message: `OpenShell Remote gateway ${entry.name} is started and selected.`,
    result: select.result,
  };
}

export async function ensureRemoteGatewayEndpoint(
  entry: OpenShellRemoteGatewayInput,
): Promise<OpenShellRemoteGatewayCommandResult> {
  if (getOpenShellRemoteConnectionMode(entry) === 'direct') return startRemoteGateway(entry);

  const started = await startRemoteGatewayProcess(entry);
  if (!started.ok) return started;

  const tunnel = await ensureRemoteGatewayTunnel(entry);
  if (!tunnel.ok) return tunnel;

  const gatewayName = getTunnelGatewayName(entry);
  const add = await runOpenShell([
    'gateway', 'add', tunnel.localEndpoint, '--name', gatewayName,
  ], { timeoutMs: 10_000 });
  if (add.exitCode !== 0 && !isAlreadyExists(add)) {
    return {
      ok: false,
      status: 'unavailable',
      gatewayName,
      localEndpoint: tunnel.localEndpoint,
      localPort: tunnel.localPort,
      diagnosticCode: 'openshell-status-failed',
      message: formatOpenShellFailure('register OpenShell Remote tunnel gateway', add),
      result: add,
    };
  }

  const selected = await selectRemoteGateway(gatewayName);
  if (!selected.ok) {
    return {
      ...selected,
      gatewayName,
      localEndpoint: tunnel.localEndpoint,
      localPort: tunnel.localPort,
      diagnosticCode: 'openshell-status-failed',
    };
  }

  return getRemoteGatewayStatus({ name: gatewayName }, {
    localEndpoint: tunnel.localEndpoint,
    localPort: tunnel.localPort,
  });
}

export async function selectRemoteGateway(name: string): Promise<OpenShellRemoteGatewayCommandResult> {
  const result = await runOpenShell(['gateway', 'select', name], { timeoutMs: 10_000 });
  if (result.exitCode === 0) {
    return {
      ok: true,
      status: 'ready',
      gatewayName: name,
      message: `OpenShell gateway ${name} selected.`,
      result,
    };
  }

  return {
    ok: false,
    status: 'unavailable',
    gatewayName: name,
    diagnosticCode: 'openshell-status-failed',
    message: formatOpenShellFailure(`select OpenShell gateway ${name}`, result),
    result,
  };
}

export async function getRemoteGatewayStatus(
  entry: Pick<OpenShellRemoteGatewayEntry, 'name'>,
  tunnel?: Pick<OpenShellRemoteGatewayCommandResult, 'localEndpoint' | 'localPort'>,
): Promise<OpenShellRemoteGatewayCommandResult> {
  const result = await runOpenShell(['--gateway', entry.name, 'status'], { timeoutMs: 10_000 });
  if (result.exitCode === 0) {
    return {
      ok: true,
      status: 'ready',
      gatewayName: entry.name,
      localEndpoint: tunnel?.localEndpoint,
      localPort: tunnel?.localPort,
      message: result.stdout.trim() || `OpenShell Remote gateway ${entry.name} is reachable.`,
      result,
    };
  }

  const diagnosticCode = tunnel && isConnectionRefused(result)
    ? 'remote-gateway-not-listening'
    : 'openshell-status-failed';
  return {
    ok: false,
    status: 'unavailable',
    gatewayName: entry.name,
    localEndpoint: tunnel?.localEndpoint,
    localPort: tunnel?.localPort,
    diagnosticCode,
    message: formatOpenShellFailure(`check OpenShell Remote gateway ${entry.name} status`, result),
    result,
  };
}

export async function measureRemoteGatewayLatency(
  entry: Pick<OpenShellRemoteGatewayEntry, 'name' | 'port' | 'localPort' | 'connectionMode'>,
): Promise<OpenShellRemoteGatewayLatencyResult> {
  const startedAt = Date.now();
  const status = getOpenShellRemoteConnectionMode(entry) === 'direct'
    ? await getRemoteGatewayStatus(entry)
    : await getRemoteGatewayStatus({ name: getTunnelGatewayName(entry) }, {
      localEndpoint: getRemoteTunnelLocalEndpoint(entry),
      localPort: getRemoteTunnelLocalPort(entry),
    });
  if (!status.ok) return status;

  return {
    ...status,
    latencyMs: Date.now() - startedAt,
  };
}

async function startRemoteGatewayProcess(
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

  if (start.exitCode === 0) {
    return {
      ok: true,
      status: 'ready',
      gatewayName: entry.name,
      message: `OpenShell Remote gateway ${entry.name} is started.`,
      result: start,
    };
  }

  return {
    ok: false,
    status: 'unavailable',
    gatewayName: entry.name,
    message: formatOpenShellFailure('start OpenShell Remote gateway', start),
    result: start,
  };
}

function isAlreadyExists(result: OpenShellCommandResult): boolean {
  return /already exists/i.test(`${result.stderr}\n${result.stdout}`);
}

function isConnectionRefused(result: OpenShellCommandResult): boolean {
  return /connection (refused|reset)|econnrefused|econnreset|connection reset by peer/i.test(`${result.stderr}\n${result.stdout}`);
}
