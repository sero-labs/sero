import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runOpenShell: vi.fn(),
}));

vi.mock('@electron/features/workspace/runtime/openshell/cli', () => ({
  runOpenShell: mocks.runOpenShell,
}));

import {
  getOpenShellRuntimeWorkspacePath,
  toOpenShellWorkspacePath,
} from '@electron/features/workspace/runtime/openshell/path';
import {
  pullWorkspaceFromSandbox,
  pushWorkspaceToSandbox,
} from '@electron/features/workspace/runtime/openshell/sync';

describe('OpenShell workspace path mapping', () => {
  const workspacePath = '/Users/me/app';

  it('maps the workspace root to /workspace/<basename>', () => {
    expect(getOpenShellRuntimeWorkspacePath(workspacePath)).toBe('/workspace/app');
    expect(toOpenShellWorkspacePath(workspacePath, workspacePath)).toBe('/workspace/app');
  });

  it('maps nested host paths using POSIX separators', () => {
    expect(toOpenShellWorkspacePath(workspacePath, '/Users/me/app/src/index.ts')).toBe('/workspace/app/src/index.ts');
  });

  it('returns null for cwd outside the workspace root', () => {
    expect(toOpenShellWorkspacePath(workspacePath, '/Users/me/other')).toBeNull();
  });
});

describe('OpenShell workspace sync helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const syncInput = {
    gatewayName: 'sero-local',
    sandboxName: 'sero-ws-1',
    workspacePath: '/Users/me/app',
  };

  it('uploads the host workspace to /workspace before execution', async () => {
    mocks.runOpenShell.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    await pushWorkspaceToSandbox(syncInput);

    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-local',
      'sandbox', 'upload', 'sero-ws-1',
      '/Users/me/app',
      '/workspace',
    ], { timeoutMs: undefined });
  });

  it('downloads the runtime workspace back into the host workspace after execution', async () => {
    mocks.runOpenShell.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    await pullWorkspaceFromSandbox(syncInput);

    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-local',
      'sandbox', 'download', 'sero-ws-1',
      '/workspace/app',
      '/Users/me/app',
    ], { timeoutMs: undefined });
  });

  it('uses an explicit runtime workspace path when provided', async () => {
    mocks.runOpenShell.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    await pullWorkspaceFromSandbox({
      ...syncInput,
      runtimeWorkspacePath: '/workspace/custom-app',
      timeoutMs: 5_000,
    });

    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-local',
      'sandbox', 'download', 'sero-ws-1',
      '/workspace/custom-app',
      '/Users/me/app',
    ], { timeoutMs: 5_000 });
  });
});
