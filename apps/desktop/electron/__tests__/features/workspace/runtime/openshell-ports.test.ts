import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runOpenShell: vi.fn(),
}));

vi.mock('@electron/features/workspace/runtime/openshell/cli', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@electron/features/workspace/runtime/openshell/cli')>();
  return {
    ...actual,
    runOpenShell: mocks.runOpenShell,
  };
});

import {
  parseForwardedLocalUrl,
  startOpenShellPortForward,
} from '@electron/features/workspace/runtime/openshell/ports';

describe('OpenShell port forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts a detached forward through the OpenShell CLI', async () => {
    mocks.runOpenShell.mockResolvedValue({
      stdout: 'Forward listening on http://127.0.0.1:5173',
      stderr: '',
      exitCode: 0,
    });

    const forwarded = await startOpenShellPortForward({
      gatewayName: 'sero-local',
      sandboxName: 'sero-ws-1',
      port: 5173,
    });

    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-local',
      'forward', 'start', '5173', 'sero-ws-1', '-d',
    ], { timeoutMs: 30_000 });
    expect(forwarded).toEqual({
      runtimePort: 5173,
      localPort: 5173,
      localUrl: 'http://127.0.0.1:5173',
      status: 'ready',
    });
  });

  it('throws with command output when forwarding fails', async () => {
    mocks.runOpenShell.mockResolvedValue({
      stdout: '',
      stderr: 'port busy',
      exitCode: 2,
    });

    await expect(startOpenShellPortForward({
      gatewayName: 'sero-local',
      sandboxName: 'sero-ws-1',
      port: 3000,
    })).rejects.toThrow('port busy');
  });

  it('starts remote preview forwarding through the selected OpenShell gateway', async () => {
    mocks.runOpenShell.mockResolvedValue({
      stdout: 'Forward listening on http://127.0.0.1:8080',
      stderr: '',
      exitCode: 0,
    });

    const forwarded = await startOpenShellPortForward({
      gatewayName: 'sero-remote-dev',
      sandboxName: 'sero-remote-ws',
      port: 8080,
    });

    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-remote-dev',
      'forward', 'start', '8080', 'sero-remote-ws', '-d',
    ], { timeoutMs: 30_000 });
    expect(forwarded.localUrl).toBe('http://127.0.0.1:8080');
  });

  it('starts cloud preview forwarding through the selected OpenShell cloud gateway', async () => {
    mocks.runOpenShell.mockResolvedValue({
      stdout: 'Forward listening on http://127.0.0.1:5174',
      stderr: '',
      exitCode: 0,
    });

    const forwarded = await startOpenShellPortForward({
      gatewayName: 'sero-cloud-prod',
      sandboxName: 'sero-cloud-ws',
      port: 5174,
    });

    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-cloud-prod',
      'forward', 'start', '5174', 'sero-cloud-ws', '-d',
    ], { timeoutMs: 30_000 });
    expect(flattenArgs()).not.toMatch(/ssh|docker|--remote/);
    expect(forwarded.localUrl).toBe('http://127.0.0.1:5174');
  });

  it('parses local forwarded URLs from CLI output', () => {
    expect(parseForwardedLocalUrl('ready at http://localhost:4321')).toEqual({
      url: 'http://127.0.0.1:4321',
      port: 4321,
    });
  });
});

function flattenArgs(): string {
  return mocks.runOpenShell.mock.calls
    .map((call) => (call[0] as string[]).join(' '))
    .join('\n');
}
