import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { DockerCommandResult, DockerRunner } from '@electron/features/workspace/runtime/backends/docker/docker-cli';
import { ensureDockerContainer } from '@electron/features/workspace/runtime/backends/docker/docker-lifecycle';

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/tmp/sero-agent',
  SERO_FIXED_ROOT: '/tmp/sero-current',
  SERO_HOST_ARTIFACTS_ROOT: '/tmp/sero-host-artifacts',
  SERO_HOME: '/tmp/sero-home',
}));

const imageRef = 'ghcr.io/sero-labs/sero-node:test';

function ok(stdout = ''): DockerCommandResult {
  return { stdout, stderr: '', exitCode: 0 };
}

function labels(installationRoot: string): Record<string, string> {
  return {
    'ai.sero.managed': 'true',
    'ai.sero.runtime': 'docker',
    'ai.sero.workspaceId': 'workspace-a',
    'ai.sero.workspacePath': '/old/workspace',
    'ai.sero.installationRoot': installationRoot,
    'ai.sero.image': imageRef,
  };
}

describe('Docker container ownership recovery', () => {
  it('rebuilds a current-install container after its workspace path moves', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'sero-docker-moved-'));
    const calls: string[][] = [];
    let inspectCount = 0;
    const run: DockerRunner = vi.fn(async (args) => {
      calls.push(args);
      if (args[0] === 'inspect') {
        inspectCount += 1;
        return ok(JSON.stringify([{
          Config: { Image: imageRef, Labels: labels('/tmp/sero-current') },
          State: { Running: true },
          Mounts: [{ Type: 'bind', Source: inspectCount === 1 ? '/old/workspace' : workspacePath, Destination: '/workspace', RW: true }],
        }]));
      }
      return ok(args[0] === 'run' ? 'container-id' : '');
    });

    await ensureDockerContainer({
      config: { workspaceId: 'workspace-a', hostPath: workspacePath, readOnlyMounts: [], writableMounts: [] },
      imageRef,
      run,
    });

    expect(calls.map((args) => args[0])).toEqual(expect.arrayContaining(['inspect', 'rm', 'run']));
    expect(calls.findIndex((args) => args[0] === 'rm')).toBeLessThan(calls.findIndex((args) => args[0] === 'run'));
  });

  it('preserves a same-name container from another installation', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'sero-docker-foreign-'));
    const run: DockerRunner = vi.fn(async (args) => {
      if (args[0] === 'inspect') {
        return ok(JSON.stringify([{
          Config: { Image: imageRef, Labels: labels('/tmp/sero-other') },
          State: { Running: true },
          Mounts: [{ Type: 'bind', Source: workspacePath, Destination: '/workspace', RW: true }],
        }]));
      }
      return ok();
    });

    await expect(ensureDockerContainer({
      config: { workspaceId: 'workspace-a', hostPath: workspacePath, readOnlyMounts: [], writableMounts: [] },
      imageRef,
      run,
    })).rejects.toThrow('Docker container name collision');
    expect(run).not.toHaveBeenCalledWith(expect.arrayContaining(['rm']), expect.anything());
  });
});
