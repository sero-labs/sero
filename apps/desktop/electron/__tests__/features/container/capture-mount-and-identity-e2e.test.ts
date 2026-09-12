/**
 * Real-container verification for two container-side defects.
 *
 * `docker inspect` reports a per-instance container id, and a bind mount skips a
 * source that does not exist. Both matter to the capture: a fresh profile's
 * container must carry the read-only capture mount, and a cached runtime answer
 * must not outlive the container it came from.
 *
 * The whole file skips when Docker or the Sero image is unavailable.
 */

import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const execFileAsync = promisify(execFile);

const envMock = vi.hoisted(() => {
  const root = `/tmp/sero-vitest/${process.pid}-container-fresh-${Math.random().toString(16).slice(2)}`;
  return {
    SERO_AGENT_DIR: `${root}/agent`,
    SERO_FIXED_ROOT: `${root}/fixed`,
    SERO_HOST_ARTIFACTS_ROOT: `${root}/host-artifacts`,
    SERO_HOME: root,
    SERO_CAPTURE_ROOT: `${root}/agent/captures`,
    SERO_HOST_RTK_STATE_ROOT: `${root}/agent/rtk`,
  };
});

vi.mock('@electron/platform/env', () => envMock);

import { buildWorkspaceContainerConfig } from '@electron/features/container/core/workspace-container-config';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { buildDockerMounts, formatMount } from '@electron/features/workspace/runtime/backends/docker/docker-mounts';
import { inspectDockerContainer, toContainerState } from '@electron/features/workspace/runtime/backends/docker/docker-lifecycle';

const IMAGE = 'ghcr.io/sero-labs/sero-node:latest';
const CONTAINER = `sero-capture-mount-e2e-${process.pid}`;

let available = false;
let workspacePath = '';

async function docker(args: string[], timeoutMs = 60_000): Promise<string> {
  const { stdout } = await execFileAsync('docker', args, { timeout: timeoutMs });
  return stdout;
}

async function dockerAvailable(): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await docker(['info', '--format', '{{.ServerVersion}}'], 30_000);
      await docker(['image', 'inspect', IMAGE], 30_000);
      return true;
    } catch {
      // Try once more.
    }
  }
  return false;
}

async function removeContainer(): Promise<void> {
  await docker(['rm', '-f', CONTAINER], 60_000).catch(() => undefined);
}

/** Start the container from the config the app builds, with the same mount args. */
async function startFromConfig(config: Parameters<typeof buildDockerMounts>[0]): Promise<void> {
  const mounts = buildDockerMounts(config, 'linux').flatMap((mount) => ['--mount', formatMount(mount)]);
  await docker(['run', '-d', '--name', CONTAINER, '--init', '--workdir', '/workspace', ...mounts, IMAGE, 'sleep', 'infinity'], 120_000);
}

describe.skipIf(!process.env.SERO_DOCKER_E2E)('capture mounts and container identity', () => {
  beforeAll(async () => {
    available = await dockerAvailable();
    if (!available) {
      throw new Error('SERO_DOCKER_E2E is set but Docker or the Sero image is unavailable.');
    }
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-mount-e2e-ws-'));
    fs.mkdirSync(workspacePath, { recursive: true });
    await removeContainer();
  }, 240_000);

  afterAll(async () => {
    await removeContainer();
    fs.rmSync(workspacePath, { recursive: true, force: true });
    fs.rmSync(path.dirname(envMock.SERO_AGENT_DIR), { recursive: true, force: true });
  });

  it('mounts the capture root read-only into a container built from a fresh profile', async () => {
    // The reported failure: the root did not exist yet, both mount builders
    // skipped it, and the first capture created it after container creation, so
    // the reported path was unreachable inside that container.
    fs.rmSync(envMock.SERO_CAPTURE_ROOT, { recursive: true, force: true });
    expect(fs.existsSync(envMock.SERO_CAPTURE_ROOT)).toBe(false);

    const manager = {
      getReferences: async () => [],
      getPath: () => undefined,
      getMounts: async () => [],
      getRoots: async () => [],
    } as unknown as WorkspaceManager;
    const config = await buildWorkspaceContainerConfig(manager, 'ws-e2e', workspacePath);
    expect(fs.existsSync(envMock.SERO_CAPTURE_ROOT)).toBe(true);

    await startFromConfig(config);

    // Docker reports the mount, and it is read-only.
    const inspect = JSON.parse(await docker(['inspect', CONTAINER])) as Array<{ Mounts?: Array<{ Source?: string; Destination?: string; RW?: boolean }> }>;
    const mount = (inspect[0]?.Mounts ?? []).find((entry) => entry.Source === envMock.SERO_CAPTURE_ROOT);
    expect(mount).toMatchObject({ Destination: envMock.SERO_CAPTURE_ROOT, RW: false });

    // The container can read a reported path and cannot write under the root.
    const captureFile = path.join(envMock.SERO_CAPTURE_ROOT, 'session-key', 'capture-1', 'combined.log');
    fs.mkdirSync(path.dirname(captureFile), { recursive: true });
    fs.writeFileSync(captureFile, 'complete output\n');

    expect(await docker(['exec', CONTAINER, 'cat', captureFile])).toBe('complete output\n');
    await expect(docker(['exec', CONTAINER, 'sh', '-c', `touch ${envMock.SERO_CAPTURE_ROOT}/probe`])).rejects.toThrow();
  }, 180_000);

  it('reports a container instance identity that changes when the container is replaced', async () => {
    const manager = {
      getReferences: async () => [],
      getPath: () => undefined,
      getMounts: async () => [],
      getRoots: async () => [],
    } as unknown as WorkspaceManager;
    const config = await buildWorkspaceContainerConfig(manager, 'ws-e2e', workspacePath);

    const first = toContainerState(CONTAINER, await inspectDockerContainer(CONTAINER), IMAGE);
    // The cache key must not be the stable workspace name.
    expect(first.id).toBe(CONTAINER);
    expect(first.instanceId).toBeDefined();
    expect(first.instanceId).not.toBe(first.id);

    await removeContainer();
    await startFromConfig(config);
    const second = toContainerState(CONTAINER, await inspectDockerContainer(CONTAINER), IMAGE);

    expect(second.instanceId).toBeDefined();
    expect(second.instanceId).not.toBe(first.instanceId);
  }, 180_000);
});
