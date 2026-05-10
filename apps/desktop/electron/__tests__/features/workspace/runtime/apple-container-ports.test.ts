import { describe, expect, it, vi } from 'vitest';
import { AppleContainerPortManager, applePreviewPublishArgs } from '@electron/features/workspace/runtime/backends/apple-container-ports';
import type { RuntimeExecResult } from '@electron/features/workspace/runtime/types';

describe('AppleContainerPortManager', () => {
  it('publishes explicit pre-allocated loopback host ports', () => {
    expect(applePreviewPublishArgs([
      { hostPort: 51000, internalPort: 32000 },
      { hostPort: 51001, internalPort: 32001 },
    ])).toEqual(['-p', '127.0.0.1:51000:32000', '-p', '127.0.0.1:51001:32001']);
  });

  it('bridges localhost and public target ports through the pool', async () => {
    const exec = vi.fn(async () => ok(''));
    const manager = new AppleContainerPortManager({ workspaceId: 'ws-a', poolSize: 2, exec });
    manager.setMappings([
      { internalPort: 32000, hostPort: 51000 },
      { internalPort: 32001, hostPort: 51001 },
    ]);

    expect(await manager.forwardPort(5173)).toMatchObject({ url: 'http://127.0.0.1:51000', bridged: true });
    expect(await manager.forwardPort(3000)).toMatchObject({ url: 'http://127.0.0.1:51001', bridged: true });
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('0.0.0.0'), 10_000);
  });

  it('detects ports without returning internal gateway ports', async () => {
    const ss = 'LISTEN 0 511 127.0.0.1:5173 0.0.0.0:*\nLISTEN 0 511 0.0.0.0:32000 0.0.0.0:*';
    const manager = new AppleContainerPortManager({ workspaceId: 'ws-a', poolSize: 1, exec: vi.fn(async () => ok(ss)) });
    manager.setMappings([{ internalPort: 32000, hostPort: 51000 }]);
    await expect(manager.detectPorts()).resolves.toEqual([5173]);
  });
});

function ok(stdout: string): RuntimeExecResult {
  return { stdout, stderr: '', exitCode: 0 };
}
