import os from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { ensureWorkspaceNode, execLocal } from '../host';

afterEach(() => vi.unstubAllEnvs());

it('runs Node through the host toolchain when PATH has no system Node', async () => {
  vi.stubEnv('PATH', '');
  const ensure = vi.fn(async () => ({ path: process.execPath }));
  const result = await execLocal('node', ['--version'], os.tmpdir(), { ensure });

  expect(result.exitCode).toBe(0);
  expect(result.stdout.trim()).toBe(process.version);
  expect(ensure).toHaveBeenCalledWith('node');
});


it('provisions shared Node for Host and leaves container prerequisites to their runtime', async () => {
  const ensure = vi.fn(async () => ({ path: process.execPath }));
  for (const actualRuntime of ['host', 'container'] as const) {
    ensure.mockClear();
    await ensureWorkspaceNode('sample', async (workspaceId) => ({
      workspaceId, workspacePath: '/sample', desiredRuntime: actualRuntime,
      actualRuntime, containerEnabled: actualRuntime === 'container', capabilityAudit: [],
    }), ensure);
    if (actualRuntime === 'host') expect(ensure).toHaveBeenCalledWith('node');
    else expect(ensure).not.toHaveBeenCalled();
  }
});
