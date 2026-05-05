import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runCommand: vi.fn(),
  runOpenShell: vi.fn(),
  formatOpenShellFailure: vi.fn(),
}));

vi.mock('@electron/features/workspace/runtime/openshell/cli', () => ({
  runCommand: mocks.runCommand,
  runOpenShell: mocks.runOpenShell,
  formatOpenShellFailure: mocks.formatOpenShellFailure,
}));

import { checkRemoteDocker } from '@electron/features/workspace/runtime/openshell/remote-ssh';
import {
  measureRemoteGatewayLatency,
  startRemoteGateway,
} from '@electron/features/workspace/runtime/openshell/remote-gateway';
import type { OpenShellCommandResult } from '@electron/features/workspace/runtime/openshell/cli';
import type { OpenShellRemoteGatewayEntry } from '@electron/features/workspace/runtime/openshell/remote-gateway-registry';

const gateway: OpenShellRemoteGatewayEntry = {
  id: 'remote-dev',
  name: 'sero-remote-dev',
  sshHost: 'dev@example.test',
  port: 8080,
  createdAt: '2026-05-05T00:00:00.000Z',
  updatedAt: '2026-05-05T00:00:00.000Z',
};

const gatewayWithKey: OpenShellRemoteGatewayEntry = {
  ...gateway,
  id: 'remote-key',
  sshKeyPath: '/Users/me/.ssh/id_ed25519',
};

describe('OpenShell Remote health helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.formatOpenShellFailure.mockImplementation((label: string, result: OpenShellCommandResult) => (
      `${label}: ${result.stderr}`
    ));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('checks remote Docker over non-interactive SSH without a key', async () => {
    mocks.runCommand.mockResolvedValue(result({ stdout: '"24.0.7"\n' }));

    const check = await checkRemoteDocker(gateway);

    expect(check.ok).toBe(true);
    expect(check.message).toContain('24.0.7');
    expect(mocks.runCommand).toHaveBeenCalledWith(
      'remote Docker prerequisite',
      'ssh',
      [
        '-o', 'BatchMode=yes',
        '-o', 'ConnectTimeout=8',
        'dev@example.test',
        'docker', 'info', '--format', '{{json .ServerVersion}}',
      ],
      { timeoutMs: 15_000 },
    );
  });

  it('includes an optional SSH key path in remote Docker diagnostics', async () => {
    mocks.runCommand.mockResolvedValue(result({ stdout: '"24.0.7"\n' }));

    await checkRemoteDocker(gatewayWithKey);

    expect(mocks.runCommand).toHaveBeenCalledWith(
      'remote Docker prerequisite',
      'ssh',
      [
        '-o', 'BatchMode=yes',
        '-o', 'ConnectTimeout=8',
        '-i', '/Users/me/.ssh/id_ed25519',
        'dev@example.test',
        'docker', 'info', '--format', '{{json .ServerVersion}}',
      ],
      { timeoutMs: 15_000 },
    );
  });

  it('returns actionable unavailable copy when remote Docker fails', async () => {
    mocks.runCommand.mockResolvedValue(result({ exitCode: 255, stderr: 'Permission denied (publickey).' }));

    const check = await checkRemoteDocker(gateway);

    expect(check.ok).toBe(false);
    expect(check.status).toBe('unavailable');
    expect(check.message).toContain('non-interactive SSH');
    expect(check.message).toContain('Docker is running on the remote host');
  });

  it('blocks endpoint-only cloud config as Phase 5 without SSH or OpenShell calls', async () => {
    const check = await checkRemoteDocker({ name: 'cloud', port: 443 });
    const start = await startRemoteGateway({ name: 'cloud', port: 443 });

    expect(check.status).toBe('unsupported');
    expect(start.status).toBe('unsupported');
    expect(check.message).toContain('Phase 5');
    expect(start.message).toContain('Phase 5');
    expect(mocks.runCommand).not.toHaveBeenCalled();
    expect(mocks.runOpenShell).not.toHaveBeenCalled();
  });

  it('starts a remote gateway with current CLI flags then selects it', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce(result({ stdout: 'started\n' }))
      .mockResolvedValueOnce(result({ stdout: 'selected\n' }));

    const start = await startRemoteGateway(gatewayWithKey);

    expect(start.ok).toBe(true);
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(1, [
      'gateway', 'start',
      '--name', 'sero-remote-dev',
      '--remote', 'dev@example.test',
      '--ssh-key', '/Users/me/.ssh/id_ed25519',
      '--port', '8080',
    ], { timeoutMs: 120_000 });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(2, [
      'gateway', 'select', 'sero-remote-dev',
    ], { timeoutMs: 10_000 });
  });

  it('starts a remote gateway without ssh-key for agent-based SSH auth', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce(result({ stdout: 'started\n' }))
      .mockResolvedValueOnce(result({ stdout: 'selected\n' }));

    await startRemoteGateway(gateway);

    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(1, [
      'gateway', 'start',
      '--name', 'sero-remote-dev',
      '--remote', 'dev@example.test',
      '--port', '8080',
    ], { timeoutMs: 120_000 });
  });

  it('formats gateway start failures without selecting the gateway', async () => {
    mocks.runOpenShell.mockResolvedValueOnce(result({ exitCode: 1, stderr: 'remote refused' }));

    const start = await startRemoteGateway(gateway);

    expect(start.ok).toBe(false);
    expect(start.message).toContain('start OpenShell Remote gateway');
    expect(mocks.runOpenShell).toHaveBeenCalledTimes(1);
  });

  it('measures latency around openshell gateway status and returns ms only on success', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_037);
    mocks.runOpenShell.mockResolvedValueOnce(result({ stdout: 'ok\n' }));

    const latency = await measureRemoteGatewayLatency(gateway);

    expect(latency.ok).toBe(true);
    expect(latency.latencyMs).toBe(37);
    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-remote-dev', 'status',
    ], { timeoutMs: 10_000 });
  });

  it('omits latency when gateway status fails', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_037);
    mocks.runOpenShell.mockResolvedValueOnce(result({ exitCode: 1, stderr: 'offline' }));

    const latency = await measureRemoteGatewayLatency(gateway);

    expect(latency.ok).toBe(false);
    expect(latency.latencyMs).toBeUndefined();
  });
});

function result(overrides: Partial<OpenShellCommandResult> = {}): OpenShellCommandResult {
  return {
    stdout: '',
    stderr: '',
    exitCode: 0,
    ...overrides,
  };
}
