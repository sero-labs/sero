import { spawn, type ChildProcessByStdio } from 'child_process';
import net from 'net';
import type { Readable } from 'stream';

import type { OpenShellRemoteGatewayEntry, OpenShellRemoteGatewayInput } from './remote-gateway-registry';

export type OpenShellRemoteTunnelStatus = 'ready' | 'unavailable' | 'unsupported';

export type OpenShellRemoteTunnelDiagnosticCode =
  | 'ssh-auth-failed'
  | 'local-port-conflict'
  | 'tunnel-exited'
  | 'unsupported';

export interface OpenShellRemoteTunnelReadyResult {
  ok: true;
  status: 'ready';
  localEndpoint: string;
  localPort: number;
}

export interface OpenShellRemoteTunnelFailureResult {
  ok: false;
  status: Exclude<OpenShellRemoteTunnelStatus, 'ready'>;
  diagnosticCode: OpenShellRemoteTunnelDiagnosticCode;
  message: string;
  localEndpoint?: string;
  localPort?: number;
}

export type OpenShellRemoteTunnelResult = OpenShellRemoteTunnelReadyResult | OpenShellRemoteTunnelFailureResult;

export interface EnsureRemoteGatewayTunnelOptions {
  earlyExitWaitMs?: number;
  restartExitWaitMs?: number;
}

interface TrackedRemoteTunnel {
  child: ChildProcessByStdio<null, Readable, Readable>;
  exited: boolean;
  stderr: string;
  targetKey: string;
}

const DEFAULT_EARLY_EXIT_WAIT_MS = 250;
const DEFAULT_RESTART_EXIT_WAIT_MS = 1_000;
const SSH_AUTH_FAILURE_PATTERN = /permission denied|publickey|authentication failed|too many authentication failures|no more authentication methods/i;
const tunnels = new Map<string, TrackedRemoteTunnel>();

export function getRemoteTunnelLocalPort(entry: Pick<OpenShellRemoteGatewayEntry, 'port' | 'localPort'>): number {
  return entry.localPort ?? entry.port;
}

export function getRemoteTunnelLocalEndpoint(entry: Pick<OpenShellRemoteGatewayEntry, 'port' | 'localPort'>): string {
  return `https://127.0.0.1:${getRemoteTunnelLocalPort(entry)}`;
}

export function buildRemoteTunnelSshArgs(entry: OpenShellRemoteGatewayInput): string[] {
  const localPort = getRemoteTunnelLocalPort(entry);
  return [
    '-N',
    '-L', `${localPort}:127.0.0.1:${entry.port}`,
    '-o', 'BatchMode=yes',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=2',
    '-o', 'ConnectTimeout=8',
    ...(entry.sshKeyPath ? ['-i', entry.sshKeyPath] : []),
    entry.sshHost,
  ];
}

export async function ensureRemoteGatewayTunnel(
  entry: OpenShellRemoteGatewayInput,
  options: EnsureRemoteGatewayTunnelOptions = {},
): Promise<OpenShellRemoteTunnelResult> {
  const localPort = getRemoteTunnelLocalPort(entry);
  const localEndpoint = getRemoteTunnelLocalEndpoint(entry);
  const key = getTunnelKey(entry);
  const targetKey = getTunnelTargetKey(entry);
  const existing = tunnels.get(key);

  if (existing && !existing.exited && !existing.child.killed) {
    if (existing.targetKey === targetKey) {
      return { ok: true, status: 'ready', localEndpoint, localPort };
    }
    await stopTrackedTunnelForReplacement(key, existing, options.restartExitWaitMs ?? DEFAULT_RESTART_EXIT_WAIT_MS);
  } else if (existing) {
    tunnels.delete(key);
  }

  if (!(await isLocalPortAvailable(localPort))) {
    return {
      ok: false,
      status: 'unavailable',
      diagnosticCode: 'local-port-conflict',
      localEndpoint,
      localPort,
      message: `Local SSH tunnel port 127.0.0.1:${localPort} is already in use. Stop the process using that port or configure a different OpenShell Remote local port.`,
    };
  }

  const child = spawn('ssh', buildRemoteTunnelSshArgs(entry), { stdio: ['ignore', 'pipe', 'pipe'] });
  const tracked: TrackedRemoteTunnel = { child, exited: false, stderr: '', targetKey };
  tunnels.set(key, tracked);
  attachTunnelListeners(key, tracked);

  const earlyFailure = await waitForEarlyTunnelFailure(tracked, options.earlyExitWaitMs ?? DEFAULT_EARLY_EXIT_WAIT_MS);
  if (earlyFailure) {
    tunnels.delete(key);
    if (!child.killed) child.kill();
    return {
      ok: false,
      status: earlyFailure.diagnosticCode === 'unsupported' ? 'unsupported' : 'unavailable',
      diagnosticCode: earlyFailure.diagnosticCode,
      localEndpoint,
      localPort,
      message: earlyFailure.message,
    };
  }

  return { ok: true, status: 'ready', localEndpoint, localPort };
}

export function stopRemoteGatewayTunnel(entry?: Pick<OpenShellRemoteGatewayEntry, 'id' | 'name' | 'port' | 'localPort'>): void {
  if (!entry) {
    for (const [key, tunnel] of tunnels) stopTrackedTunnel(key, tunnel);
    return;
  }
  const key = getTunnelKey(entry);
  const tunnel = tunnels.get(key);
  if (tunnel) stopTrackedTunnel(key, tunnel);
}

function attachTunnelListeners(key: string, tracked: TrackedRemoteTunnel): void {
  tracked.child.stderr.on('data', (chunk: Buffer | string) => {
    tracked.stderr = `${tracked.stderr}${chunk.toString()}`;
  });
  tracked.child.once('error', (error: Error) => {
    tracked.exited = true;
    tracked.stderr = `${tracked.stderr}${error.message}`;
    tunnels.delete(key);
  });
  tracked.child.once('exit', () => {
    tracked.exited = true;
    tunnels.delete(key);
  });
}

async function waitForEarlyTunnelFailure(
  tracked: TrackedRemoteTunnel,
  waitMs: number,
): Promise<{ diagnosticCode: OpenShellRemoteTunnelDiagnosticCode; message: string } | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (failure: { diagnosticCode: OpenShellRemoteTunnelDiagnosticCode; message: string } | undefined): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      tracked.child.stderr.off('data', onStderr);
      tracked.child.off('error', onError);
      tracked.child.off('exit', onExit);
      resolve(failure);
    };
    const classify = (): { diagnosticCode: OpenShellRemoteTunnelDiagnosticCode; message: string } | undefined => {
      if (SSH_AUTH_FAILURE_PATTERN.test(tracked.stderr)) {
        return {
          diagnosticCode: 'ssh-auth-failed',
          message: `SSH authentication failed for the OpenShell Remote tunnel. Ensure non-interactive SSH key or agent auth works for ${formatTunnelDestination(tracked.stderr)}.`,
        };
      }
      if (!tracked.exited) return undefined;
      return {
        diagnosticCode: 'tunnel-exited',
        message: `SSH tunnel exited before it became ready. ${tracked.stderr.trim()}`.trim(),
      };
    };
    const onStderr = (): void => {
      const failure = classify();
      if (failure) finish(failure);
    };
    const onError = (): void => {
      finish({ diagnosticCode: 'unsupported', message: `Failed to start ssh for the OpenShell Remote tunnel. ${tracked.stderr.trim()}`.trim() });
    };
    const onExit = (): void => {
      finish(classify());
    };
    const timer = setTimeout(() => finish(classify()), waitMs);

    tracked.child.stderr.on('data', onStderr);
    tracked.child.once('error', onError);
    tracked.child.once('exit', onExit);
  });
}

function stopTrackedTunnel(key: string, tunnel: TrackedRemoteTunnel): void {
  tunnels.delete(key);
  tunnel.exited = true;
  if (!tunnel.child.killed) tunnel.child.kill();
}

async function stopTrackedTunnelForReplacement(key: string, tunnel: TrackedRemoteTunnel, timeoutMs: number): Promise<void> {
  tunnels.delete(key);
  if (tunnel.exited || tunnel.child.killed) return;
  const exited = waitForChildExit(tunnel, timeoutMs);
  tunnel.child.kill();
  await exited;
}

function waitForChildExit(tunnel: TrackedRemoteTunnel, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      tunnel.child.off('exit', onDone);
      tunnel.child.off('close', onDone);
      tunnel.child.off('error', onDone);
      resolve();
    };
    const onDone = (): void => finish();
    const timer = setTimeout(finish, timeoutMs);

    tunnel.child.once('exit', onDone);
    tunnel.child.once('close', onDone);
    tunnel.child.once('error', onDone);
  });
}

function isLocalPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

function getTunnelKey(entry: Pick<OpenShellRemoteGatewayEntry, 'id' | 'name'>): string {
  return `${entry.id}:${entry.name}`;
}

function getTunnelTargetKey(entry: OpenShellRemoteGatewayInput): string {
  return JSON.stringify({
    sshHost: entry.sshHost,
    sshKeyPath: entry.sshKeyPath ?? null,
    remotePort: entry.port,
    localPort: getRemoteTunnelLocalPort(entry),
  });
}

function formatTunnelDestination(stderr: string): string {
  return stderr.trim().length > 0 ? `the configured host. ${stderr.trim()}` : 'the configured host';
}
