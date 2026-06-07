import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  rmSyncMock: vi.fn(),
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/tmp/sero-agent',
  SERO_FIXED_ROOT: '/tmp/sero-fixed',
  SERO_HOME: '/tmp/sero-home',
}));

vi.mock('child_process', () => ({
  execFile: mocks.execFileMock,
}));

vi.mock('util', () => ({
  promisify: () => mocks.execFileMock,
}));

vi.mock('fs', () => ({
  default: {
    existsSync: mocks.existsSyncMock,
    readFileSync: mocks.readFileSyncMock,
    writeFileSync: mocks.writeFileSyncMock,
    mkdirSync: mocks.mkdirSyncMock,
    rmSync: mocks.rmSyncMock,
  },
}));

import { createFreshContainer } from '@electron/features/container/core/lifecycle';
import type { ContainerState } from '@electron/features/container/core/types';

describe('createFreshContainer', () => {
  beforeEach(() => {
    mocks.execFileMock.mockReset();
    mocks.existsSyncMock.mockReset();
    mocks.readFileSyncMock.mockReset();
    mocks.writeFileSyncMock.mockReset();
    mocks.mkdirSyncMock.mockReset();
    mocks.rmSyncMock.mockReset();

    mocks.execFileMock.mockResolvedValue({ stdout: '', stderr: '' });
    mocks.existsSyncMock.mockReturnValue(true);
    mocks.readFileSyncMock.mockReturnValue('');
  });

  it('mounts readOnlyMounts as read-only while leaving writable mounts read-write', async () => {
    const execFn = vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 }));
    const inspectState: ContainerState = {
      id: 'sero-ws-1',
      image: 'ghcr.io/sero-labs/sero-node:latest',
      state: 'running',
      ipAddress: '192.168.64.2',
      cpus: 2,
      memoryBytes: 1024,
    };
    const inspectFn = vi.fn(async () => inspectState);

    await createFreshContainer(
      {
        workspaceId: 'ws-1',
        hostPath: '/host/workspace',
        readOnlyMounts: ['/host/skills', '/host/prompts'],
        writableMounts: ['/host/global'],
        bindMounts: [{ source: '/host/sero-logs', target: '/workspace/.sero/logs/dev', readonly: true }],
      },
      'sero-ws-1',
      new Map(),
      execFn,
      inspectFn,
    );

    const runArgs = mocks.execFileMock.mock.calls[0]?.[1] as string[];
    expect(runArgs).toEqual(expect.arrayContaining([
      '--volume',
      '/host/workspace:/workspace',
      '--volume',
      '/host/skills:/host/skills:ro',
      '--volume',
      '/host/prompts:/host/prompts:ro',
      '--volume',
      '/host/global:/host/global',
      '--volume',
      '/host/sero-logs:/workspace/.sero/logs/dev:ro',
    ]));
    expect(runArgs).not.toContain('/host/global:/host/global:ro');
  });
});
