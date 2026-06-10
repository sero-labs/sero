import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { provisionGraphify, GRAPHIFY_VERSION, graphifyBinPath } from './provisioner';
import type { ExecResult } from './bounded-exec';

const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', exitCode: 0 });
const fail = (stderr: string): ExecResult => ({ stdout: '', stderr, exitCode: 1 });

describe('provisionGraphify', () => {
  it('skips install when the pinned version is already present', async () => {
    const exec = vi.fn().mockResolvedValue(ok(`graphify ${GRAPHIFY_VERSION}`));
    const result = await provisionGraphify({ ensureUv: async () => '/uv', exec, toolsDir: '/tools' });
    expect(result.graphifyPath).toBe(graphifyBinPath('/tools'));
    expect(exec).toHaveBeenCalledTimes(1); // version probe only
  });

  it('installs via uv tool install when missing, with isolated uv env', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce(fail('not found'))                 // probe
      .mockResolvedValueOnce(ok('Installed graphifyy'))          // install
      .mockResolvedValueOnce(ok(`graphify ${GRAPHIFY_VERSION}`)); // verify
    const result = await provisionGraphify({ ensureUv: async () => '/uv', exec, toolsDir: '/tools' });
    expect(result.version).toBe(GRAPHIFY_VERSION);
    const installCall = exec.mock.calls[1];
    expect(installCall[0]).toBe('/uv');
    expect(installCall[1]).toEqual(['tool', 'install', '--force', `graphifyy==${GRAPHIFY_VERSION}`]);
    expect(installCall[2].env.UV_TOOL_BIN_DIR).toBe(path.join('/tools', 'bin'));
  });

  it('throws a useful error when install fails', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce(fail('not found'))
      .mockResolvedValueOnce(fail('network unreachable'));
    await expect(provisionGraphify({ ensureUv: async () => '/uv', exec, toolsDir: '/tools' }))
      .rejects.toThrow(/network unreachable/);
  });
});
