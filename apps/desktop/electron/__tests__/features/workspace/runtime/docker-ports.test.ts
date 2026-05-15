import { describe, expect, it, vi } from 'vitest';
import { DockerPortManager } from '@electron/features/workspace/runtime/backends/docker/docker-ports';
import type { DockerCommandResult, DockerRunner } from '@electron/features/workspace/runtime/backends/docker/docker-cli';

describe('DockerPortManager', () => {
  it('maps target port to allocated localhost URL through a bridge', async () => {
    const run: DockerRunner = vi.fn(async () => ok(JSON.stringify([{ NetworkSettings: { Ports: { '32000/tcp': [{ HostPort: '49153' }] } } }])));
    const exec = vi.fn(async () => ok(''));
    const manager = new DockerPortManager({ workspaceId: 'ws-a', poolSize: 1, run, exec });

    await manager.refreshFromInspect();
    const forwarded = await manager.forwardPort(5173);

    expect(forwarded).toEqual({ targetPort: 5173, hostPort: 49153, url: 'http://127.0.0.1:49153', bridged: true });
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('sero-preview-bridge-ws-a-5173-32000'), 10_000);
  });

  it('keeps workspace host ports distinct when Docker inspect returns different allocations', async () => {
    const a = new DockerPortManager({ workspaceId: 'a', poolSize: 1, run: vi.fn(async () => inspect(49153)), exec: vi.fn(async () => ok('')) });
    const b = new DockerPortManager({ workspaceId: 'b', poolSize: 1, run: vi.fn(async () => inspect(49154)), exec: vi.fn(async () => ok('')) });
    await a.refreshFromInspect();
    await b.refreshFromInspect();
    const first = await a.forwardPort(5173);
    const second = await b.forwardPort(5173);
    expect(first.url).not.toBe(second.url);
  });
});

function inspect(hostPort: number): DockerCommandResult {
  return ok(JSON.stringify([{ NetworkSettings: { Ports: { '32000/tcp': [{ HostPort: String(hostPort) }] } } }]));
}

function ok(stdout: string): DockerCommandResult {
  return { stdout, stderr: '', exitCode: 0 };
}
