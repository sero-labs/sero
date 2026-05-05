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
  getOpenShellPolicyDiagnostics,
  parseOpenShellBlockedEvents,
} from '@electron/features/workspace/runtime/openshell/policy-diagnostics';

describe('OpenShell policy diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runOpenShell.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  it('uses only read-only OpenShell policy and log commands', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'active policy yaml', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'policy history', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'warn: landlock denied /etc/passwd', stderr: '', exitCode: 0 });

    const diagnostics = await getOpenShellPolicyDiagnostics({
      gatewayName: 'sero-local',
      sandboxName: 'sero-ws-1',
      runtimeConfig: { providerId: 'openshell-local', policyProfileId: 'strict' },
    });

    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-local',
      'policy', 'get', 'sero-ws-1', '--full',
    ], { timeoutMs: 10_000 });
    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-local',
      'policy', 'list', 'sero-ws-1',
    ], { timeoutMs: 10_000 });
    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-local',
      'logs', 'sero-ws-1', '-n', '200', '--source', 'all', '--level', 'warn',
    ], { timeoutMs: 10_000 });
    expect(mocks.runOpenShell).toHaveBeenCalledTimes(3);
    expect(diagnostics.selectedProfile.id).toBe('strict');
    expect(diagnostics.enforcementStatus).toBe('profile-preview-only');
    expect(diagnostics.activePolicy).toEqual({ available: true, summary: 'active policy yaml' });
    expect(diagnostics.blockedEvents).toHaveLength(1);
  });

  it('returns non-fatal unavailable diagnostics when no sandbox name is present', async () => {
    const diagnostics = await getOpenShellPolicyDiagnostics({
      gatewayName: 'sero-local',
      runtimeConfig: { providerId: 'openshell-local' },
    });

    expect(mocks.runOpenShell).not.toHaveBeenCalled();
    expect(diagnostics.selectedProfile.id).toBe('dev');
    expect(diagnostics.activePolicy.available).toBe(false);
    expect(diagnostics.activePolicy.summary).toContain('unavailable until a sandbox has been created');
    expect(diagnostics.blockedEvents).toEqual([]);
  });

  it('keeps CLI failures non-fatal and sanitizes output', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: '', stderr: 'sandbox missing token=secret-value', exitCode: 2 })
      .mockResolvedValueOnce({ stdout: '', stderr: 'not found', exitCode: 2 })
      .mockResolvedValueOnce({ stdout: '', stderr: 'logs unavailable', exitCode: 2 });

    const diagnostics = await getOpenShellPolicyDiagnostics({
      gatewayName: 'sero-local',
      sandboxName: 'missing-sandbox',
      runtimeConfig: { providerId: 'openshell-local' },
    });

    expect(diagnostics.activePolicy.available).toBe(false);
    expect(diagnostics.activePolicy.summary).toContain('token=[redacted]');
    expect(diagnostics.blockedEvents).toEqual([]);
  });

  it('parses denied and blocked log events best-effort', () => {
    const events = parseOpenShellBlockedEvents([
      'info: normal startup',
      'warn: permission denied reading /root/.ssh/id_rsa',
      'warn: landlock blocked write to /etc/hosts',
      'warn: policy rejected outbound request',
    ].join('\n'));

    expect(events.map((event) => event.matchedTerms)).toEqual([
      ['permission denied', 'denied'],
      ['blocked', 'landlock'],
      ['policy'],
    ]);
    expect(events.every((event) => event.bestEffort)).toBe(true);
  });
});
