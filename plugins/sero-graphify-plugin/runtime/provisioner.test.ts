import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  provisionGraphify,
  GRAPHIFY_VERSION,
  GRAPHIFY_INSTALL_SPEC,
  graphifyBinPath,
  installSpecMarkerPath,
} from './provisioner';
import type { ExecResult } from './bounded-exec';

const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', exitCode: 0, truncated: false });
const fail = (stderr: string): ExecResult => ({ stdout: '', stderr, exitCode: 1, truncated: false });

const toolsDir = () => mkdtemp(path.join(os.tmpdir(), 'graphify-tools-'));

describe('provisionGraphify', () => {
  it('pins backend extras so semantic extraction works out of the box', () => {
    expect(GRAPHIFY_INSTALL_SPEC).toBe(`graphifyy[anthropic,openai,gemini,kimi,ollama]==${GRAPHIFY_VERSION}`);
  });

  it('skips install when the recorded spec matches and the binary runs', async () => {
    const tools = await toolsDir();
    await writeFile(installSpecMarkerPath(tools), GRAPHIFY_INSTALL_SPEC, 'utf8');
    const exec = vi.fn().mockResolvedValue(ok(`graphify ${GRAPHIFY_VERSION}`));
    const result = await provisionGraphify({ ensureUv: async () => '/uv', exec, toolsDir: tools, baseEnv: {} });
    expect(result.graphifyPath).toBe(graphifyBinPath(tools));
    expect(exec).toHaveBeenCalledTimes(1); // version probe only
  });

  it('reinstalls when the marker is missing even if the version probe would pass', async () => {
    // A bare `graphifyy==X` install answers --version fine but lacks the
    // backend SDK extras; only the marker proves the extras are present.
    const tools = await toolsDir();
    const exec = vi.fn()
      .mockResolvedValueOnce(ok('Installed graphifyy'))            // install
      .mockResolvedValueOnce(ok(`graphify ${GRAPHIFY_VERSION}`));  // verify
    const result = await provisionGraphify({ ensureUv: async () => '/uv', exec, toolsDir: tools, baseEnv: {} });
    expect(result.version).toBe(GRAPHIFY_VERSION);
    const installCall = exec.mock.calls[0];
    expect(installCall[0]).toBe('/uv');
    expect(installCall[1]).toEqual(['tool', 'install', '--force', GRAPHIFY_INSTALL_SPEC]);
    expect(installCall[2].env.UV_TOOL_BIN_DIR).toBe(path.join(tools, 'bin'));
    expect((await readFile(installSpecMarkerPath(tools), 'utf8')).trim()).toBe(GRAPHIFY_INSTALL_SPEC);
  });

  it('reinstalls when the recorded spec is stale (e.g. bare install without extras)', async () => {
    const tools = await toolsDir();
    await writeFile(installSpecMarkerPath(tools), `graphifyy==${GRAPHIFY_VERSION}`, 'utf8');
    const exec = vi.fn()
      .mockResolvedValueOnce(ok('Installed graphifyy'))
      .mockResolvedValueOnce(ok(`graphify ${GRAPHIFY_VERSION}`));
    await provisionGraphify({ ensureUv: async () => '/uv', exec, toolsDir: tools, baseEnv: {} });
    expect(exec.mock.calls[0][1]).toEqual(['tool', 'install', '--force', GRAPHIFY_INSTALL_SPEC]);
  });

  it('throws a useful error when install fails and leaves no marker', async () => {
    const tools = await toolsDir();
    const exec = vi.fn().mockResolvedValueOnce(fail('network unreachable'));
    await expect(provisionGraphify({ ensureUv: async () => '/uv', exec, toolsDir: tools, baseEnv: {} }))
      .rejects.toThrow(/network unreachable/);
    await expect(readFile(installSpecMarkerPath(tools), 'utf8')).rejects.toThrow();
  });
});
