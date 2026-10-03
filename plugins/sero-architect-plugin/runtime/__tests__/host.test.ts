import os from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { execLocal } from '../host';

afterEach(() => vi.unstubAllEnvs());

it('runs Node through the host toolchain when PATH has no system Node', async () => {
  vi.stubEnv('PATH', '');
  const ensure = vi.fn(async () => ({ path: process.execPath }));
  const result = await execLocal('node', ['--version'], os.tmpdir(), { ensure });

  expect(result.exitCode).toBe(0);
  expect(result.stdout.trim()).toBe(process.version);
  expect(ensure).toHaveBeenCalledWith('node');
});
