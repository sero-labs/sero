import { EventEmitter } from 'events';
import net from 'net';
import { PassThrough } from 'stream';
import type { ChildProcessByStdio } from 'child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: mocks.spawn,
}));

import {
  buildRemoteTunnelSshArgs,
  ensureRemoteGatewayTunnel,
  getRemoteTunnelLocalEndpoint,
  getRemoteTunnelLocalPort,
  stopRemoteGatewayTunnel,
} from '@electron/features/workspace/runtime/openshell/remote-tunnel';
import type { OpenShellRemoteGatewayEntry } from '@electron/features/workspace/runtime/openshell/remote-gateway-registry';

const gateway: OpenShellRemoteGatewayEntry = {
  id: 'remote-dev',
  name: 'sero-remote-dev',
  sshHost: 'dev@example.test',
  port: 18080,
  createdAt: '2026-05-05T00:00:00.000Z',
  updatedAt: '2026-05-05T00:00:00.000Z',
};

const gatewayWithKey: OpenShellRemoteGatewayEntry = {
  ...gateway,
  id: 'remote-key',
  sshKeyPath: '/Users/me/.ssh/id_ed25519',
  localPort: 19080,
};

describe('OpenShell Remote managed SSH tunnel helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopRemoteGatewayTunnel();
  });

  afterEach(() => {
    stopRemoteGatewayTunnel();
    vi.restoreAllMocks();
  });

  it('builds exact SSH tunnel args without an explicit key', () => {
    expect(getRemoteTunnelLocalPort(gateway)).toBe(18080);
    expect(getRemoteTunnelLocalEndpoint(gateway)).toBe('https://127.0.0.1:18080');
    expect(buildRemoteTunnelSshArgs(gateway)).toEqual([
      '-N',
      '-L', '18080:127.0.0.1:18080',
      '-o', 'BatchMode=yes',
      '-o', 'ExitOnForwardFailure=yes',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=2',
      '-o', 'ConnectTimeout=8',
      'dev@example.test',
    ]);
  });

  it('builds exact SSH tunnel args with localPort and sshKeyPath', () => {
    expect(getRemoteTunnelLocalPort(gatewayWithKey)).toBe(19080);
    expect(getRemoteTunnelLocalEndpoint(gatewayWithKey)).toBe('https://127.0.0.1:19080');
    expect(buildRemoteTunnelSshArgs(gatewayWithKey)).toEqual([
      '-N',
      '-L', '19080:127.0.0.1:18080',
      '-o', 'BatchMode=yes',
      '-o', 'ExitOnForwardFailure=yes',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=2',
      '-o', 'ConnectTimeout=8',
      '-i', '/Users/me/.ssh/id_ed25519',
      'dev@example.test',
    ]);
  });

  it('starts and reuses an existing live tunnel for repeated ensure calls', async () => {
    mocks.spawn.mockReturnValue(createChildProcess().process);

    const first = await ensureRemoteGatewayTunnel(gateway, { earlyExitWaitMs: 1 });
    const second = await ensureRemoteGatewayTunnel(gateway, { earlyExitWaitMs: 1 });

    expect(first).toEqual({ ok: true, status: 'ready', localEndpoint: 'https://127.0.0.1:18080', localPort: 18080 });
    expect(second).toEqual(first);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(mocks.spawn).toHaveBeenCalledWith('ssh', buildRemoteTunnelSshArgs(gateway), { stdio: ['ignore', 'pipe', 'pipe'] });
  });

  it('restarts the tunnel when the tracked child has exited', async () => {
    const firstChild = createChildProcess();
    const secondChild = createChildProcess();
    mocks.spawn.mockReturnValueOnce(firstChild.process).mockReturnValueOnce(secondChild.process);

    await ensureRemoteGatewayTunnel(gateway, { earlyExitWaitMs: 1 });
    firstChild.process.emit('exit', 255, null);
    const restarted = await ensureRemoteGatewayTunnel(gateway, { earlyExitWaitMs: 1 });

    expect(restarted.ok).toBe(true);
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
  });

  it('restarts the tunnel when a saved gateway keeps its identity but changes SSH target', async () => {
    const firstChild = createChildProcess();
    const secondChild = createChildProcess();
    const editedGateway: OpenShellRemoteGatewayEntry = {
      ...gateway,
      sshHost: 'new-dev@example.test',
      sshKeyPath: '/Users/me/.ssh/new_ed25519',
      port: 18081,
      localPort: 18080,
      updatedAt: '2026-05-06T00:00:00.000Z',
    };
    mocks.spawn.mockReturnValueOnce(firstChild.process).mockReturnValueOnce(secondChild.process);

    await ensureRemoteGatewayTunnel(gateway, { earlyExitWaitMs: 1 });
    const restartedPromise = ensureRemoteGatewayTunnel(editedGateway, { earlyExitWaitMs: 1, restartExitWaitMs: 100 });

    expect(firstChild.kill).toHaveBeenCalledTimes(1);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    firstChild.process.emit('exit', 255, null);
    const restarted = await restartedPromise;

    expect(restarted).toEqual({ ok: true, status: 'ready', localEndpoint: 'https://127.0.0.1:18080', localPort: 18080 });
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    expect(mocks.spawn).toHaveBeenLastCalledWith('ssh', buildRemoteTunnelSshArgs(editedGateway), { stdio: ['ignore', 'pipe', 'pipe'] });
  });

  it('returns local-port-conflict when another process owns the desired local port', async () => {
    const server = await listenOnEphemeralPort();
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
      const result = await ensureRemoteGatewayTunnel({ ...gateway, localPort: address.port }, { earlyExitWaitMs: 1 });

      expect(result.ok).toBe(false);
      expect(result).toMatchObject({
        status: 'unavailable',
        diagnosticCode: 'local-port-conflict',
        localEndpoint: `https://127.0.0.1:${address.port}`,
        localPort: address.port,
      });
      if (result.ok) throw new Error('Expected local port conflict');
      expect(result.message).toContain(`127.0.0.1:${address.port}`);
      expect(result.message).toContain('configure a different OpenShell Remote local port');
      expect(mocks.spawn).not.toHaveBeenCalled();
    } finally {
      await closeServer(server);
    }
  });

  it('classifies early SSH permission failures as ssh-auth-failed', async () => {
    mocks.spawn.mockImplementation(() => {
      const child = createChildProcess();
      process.nextTick(() => {
        child.stderr.write('Permission denied (publickey).\n');
      });
      return child.process;
    });

    const result = await ensureRemoteGatewayTunnel(gateway, { earlyExitWaitMs: 50 });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      status: 'unavailable',
      diagnosticCode: 'ssh-auth-failed',
      localEndpoint: 'https://127.0.0.1:18080',
      localPort: 18080,
    });
    if (result.ok) throw new Error('Expected SSH auth failure');
    expect(result.message).toContain('non-interactive SSH key or agent auth');
  });

  it('stops and unregisters the tracked child', async () => {
    const child = createChildProcess();
    mocks.spawn.mockReturnValue(child.process);

    await ensureRemoteGatewayTunnel(gateway, { earlyExitWaitMs: 1 });
    stopRemoteGatewayTunnel(gateway);
    await ensureRemoteGatewayTunnel(gateway, { earlyExitWaitMs: 1 });

    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
  });
});

function createChildProcess() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const emitter = new EventEmitter();
  const kill = vi.fn(() => {
    process.killed = true;
    return true;
  });
  const process = Object.assign(emitter, {
    stdout,
    stderr,
    stdin: new PassThrough(),
    killed: false,
    kill,
  }) as unknown as ChildProcessByStdio<null, PassThrough, PassThrough> & { killed: boolean };
  return { process, stdout, stderr, kill };
}

function listenOnEphemeralPort(): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
