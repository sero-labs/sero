import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { DEFAULT_IMAGE } from '@electron/features/container/core/types';
import type { DockerCommandResult, DockerRunner } from '@electron/features/workspace/runtime/backends/docker/docker-cli';
import { ensureDockerImage } from '@electron/features/workspace/runtime/backends/docker/docker-image';
import { createDockerRunArgs } from '@electron/features/workspace/runtime/backends/docker/docker-lifecycle';
import { mountArgs } from '@electron/features/workspace/runtime/backends/docker/docker-mounts';
import { DockerBackend } from '@electron/features/workspace/runtime/backends/docker/docker-backend';

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/tmp/sero-agent',
  SERO_HOME: '/tmp/sero-home',
}));

vi.mock('@electron/features/container/core/workspace-container-config', () => ({
  buildWorkspaceContainerConfig: vi.fn(async () => ({
    workspaceId: 'ws-1',
    hostPath: '/tmp/sero-docker-workspace',
    readOnlyMounts: ['/tmp/sero-agent/skills', '/tmp/sero-agent/prompts'],
    writableMounts: ['/tmp/sero-docker-shared'],
  })),
}));

describe('Docker runtime backend core', () => {
  it('builds docker run args with labels, env, user strategy, and mounts', () => {
    mkdirSync('/tmp/sero-agent/skills', { recursive: true });
    mkdirSync('/tmp/sero-agent/prompts', { recursive: true });
    mkdirSync('/tmp/sero-shared', { recursive: true });

    const args = createDockerRunArgs({
      workspaceId: 'ws-1',
      hostPath: '/host/workspace',
      readOnlyMounts: ['/tmp/sero-agent/skills', '/tmp/sero-agent/prompts'],
      writableMounts: ['/tmp/sero-shared'],
    }, 'ghcr.io/sero-labs/sero-node:test');

    expect(args).toEqual(expect.arrayContaining([
      'run', '-d', '--name', 'sero-ws-1', '--init',
      '--label', 'ai.sero.managed=true',
      '--label', 'ai.sero.runtime=docker',
      '--label', 'ai.sero.workspaceId=ws-1',
      '--label', 'ai.sero.image=ghcr.io/sero-labs/sero-node:test',
      '--workdir', '/workspace',
      '--env', 'TERM=xterm-256color',
      '--env', 'HOST=0.0.0.0',
      '--env', 'VITE_HOST=0.0.0.0',
      '--env', 'HOSTNAME=0.0.0.0',
      '--env', 'SERO_RUNTIME_BACKEND=docker',
      '--env', 'HOME=/tmp/sero-home',
      '--mount', 'type=bind,source=/host/workspace,target=/workspace',
      '--mount', 'type=bind,source=/tmp/sero-shared,target=/tmp/sero-shared',
      '--mount', 'type=bind,source=/tmp/sero-agent/skills,target=/tmp/sero-agent/skills,readonly',
      '--mount', 'type=bind,source=/tmp/sero-agent/prompts,target=/tmp/sero-agent/prompts,readonly',
      'ghcr.io/sero-labs/sero-node:test', 'sleep', 'infinity',
    ]));
    if (process.platform !== 'win32') expect(args).toContain('--user');
  });

  it('normalizes Windows Docker Desktop bind source without shell quoting', () => {
    expect(mountArgs([{ source: 'C:\\Users\\daniel\\repo', target: '/workspace' }])).toEqual([
      '--mount', 'type=bind,source=C:\\Users\\daniel\\repo,target=/workspace',
    ]);
  });

  it('ensures image with inspect hit, pull success, build fallback, and failure', async () => {
    const imagesDir = mkdtempSync(path.join(tmpdir(), 'sero-image-test-'));
    writeFileSync(path.join(imagesDir, 'Dockerfile.sero-node'), 'FROM scratch\n');

    await expect(ensureDockerImage({ imageRef: 'image:local', run: sequence([ok('inspect')]), imagesDir }))
      .resolves.toMatchObject({ source: 'local' });
    await expect(ensureDockerImage({ imageRef: 'image:pull', run: sequence([fail('missing'), ok('pull')]), imagesDir }))
      .resolves.toMatchObject({ source: 'pulled' });
    await expect(ensureDockerImage({ imageRef: 'image:build', run: sequence([fail('missing'), fail('offline'), ok('build')]), imagesDir }))
      .resolves.toMatchObject({ source: 'built' });
    await expect(ensureDockerImage({ imageRef: 'image:fail', run: sequence([fail('missing'), fail('offline'), fail('bad build')]), imagesDir }))
      .rejects.toThrow('pull and local build failed');
  });

  it('uses the shared latest fallback image when no pinned tag is configured', async () => {
    const calls: string[][] = [];
    const run: DockerRunner = vi.fn(async (args: string[]) => {
      calls.push(args);
      return ok('inspect');
    });

    await expect(ensureDockerImage({ run })).resolves.toMatchObject({ imageRef: DEFAULT_IMAGE, source: 'local' });
    expect(calls[0]).toEqual(['image', 'inspect', 'ghcr.io/sero-labs/sero-node:latest']);
  });

  it('passes pinned sero-node tags into local fallback image labels', async () => {
    const imagesDir = mkdtempSync(path.join(tmpdir(), 'sero-image-tag-test-'));
    const calls: string[][] = [];
    writeFileSync(path.join(imagesDir, 'Dockerfile.sero-node'), 'FROM scratch\n');

    await ensureDockerImage({
      imageRef: 'ghcr.io/sero-labs/sero-node:0.1.0',
      imagesDir,
      run: vi.fn(async (args: string[]) => {
        calls.push(args);
        if (args[0] === 'build') return ok('build');
        return fail('missing');
      }),
    });

    expect(calls.find((args) => args[0] === 'build')).toEqual(expect.arrayContaining([
      '-t', 'ghcr.io/sero-labs/sero-node:0.1.0',
      '--build-arg', 'SERO_NODE_VERSION=0.1.0',
    ]));
  });

  it('exec injects cwd, env, runtime env, and trusted git auth only when requested', async () => {
    const calls: string[][] = [];
    let inspectCount = 0;
    const run: DockerRunner = vi.fn(async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'image') return ok('[]');
      if (args[0] === 'inspect') {
        inspectCount += 1;
        if (inspectCount === 1) return fail('not found');
        return ok(JSON.stringify([{ Config: { Image: 'image', Labels: {} }, State: { Running: true }, NetworkSettings: { Ports: { '32000/tcp': [{ HostPort: '49153' }], '32001/tcp': [{ HostPort: '49154' }] } } }]));
      }
      return ok(args[0] === 'run' ? 'container-id' : '');
    });
    const backend = new DockerBackend({
      workspaceId: 'ws-1',
      hostWorkspacePath: '/tmp/sero-docker-workspace',
      workspaceManager: { getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'docker', previewPortPoolSize: 2 }) } as unknown as WorkspaceManager,
      getGitAuthEnvVars: () => ({ GH_TOKEN: 'secret-token' }),
      run,
    });

    await backend.exec({ command: 'git status', cwd: '/workspace/app', env: { FOO: 'bar' }, injectGitAuth: true });

    const execCall = calls.find((args) => args[0] === 'exec' && args.includes('git status'));
    expect(execCall).toEqual(expect.arrayContaining([
      'exec', '-w', '/workspace/app', '--env', 'FOO=bar', '--env', 'GH_TOKEN=secret-token',
      'sero-ws-1', 'sh', '-lc', 'git status',
    ]));
  });
});

function ok(stdout = ''): DockerCommandResult {
  return { stdout, stderr: '', exitCode: 0 };
}

function fail(stderr = 'failed'): DockerCommandResult {
  return { stdout: '', stderr, exitCode: 1 };
}

function sequence(results: DockerCommandResult[]): DockerRunner {
  const run = vi.fn(async () => results.shift() ?? ok());
  return run;
}
