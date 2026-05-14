import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { DEFAULT_IMAGE } from '@electron/features/container/core/types';
import { buildWorkspaceContainerConfig } from '@electron/features/container/core/workspace-container-config';
import type { DockerCommandResult, DockerRunner } from '@electron/features/workspace/runtime/backends/docker/docker-cli';
import { dockerImagesDir, ensureDockerImage } from '@electron/features/workspace/runtime/backends/docker/docker-image';
import { createDockerRunArgs, ensureDockerContainer } from '@electron/features/workspace/runtime/backends/docker/docker-lifecycle';
import { mountArgs } from '@electron/features/workspace/runtime/backends/docker/docker-mounts';
import { DockerBackend } from '@electron/features/workspace/runtime/backends/docker/docker-backend';
import type { RuntimeDevServer } from '@electron/features/workspace/runtime/types';

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
      '--env', 'PLAYWRIGHT_BROWSERS_PATH=/ms-playwright',
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

  it('recreates an expected stopped Docker container when docker start exits but container is not running', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'sero-docker-ws-'));
    const calls: string[][] = [];
    const config = {
      workspaceId: 'ws-1',
      hostPath: workspacePath,
      writableMounts: [],
      readOnlyMounts: [],
    };
    const run = vi.fn(async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'inspect' && calls.filter((call) => call[0] === 'inspect').length === 1) {
        return ok(JSON.stringify([{
          Config: { Image: 'image:test', Labels: expectedDockerLabels('image:test') },
          State: { Running: false },
          Mounts: [{ Type: 'bind', Source: workspacePath, Destination: '/workspace', RW: true }],
        }]));
      }
      if (args[0] === 'inspect' && calls.filter((call) => call[0] === 'inspect').length === 2) {
        return ok(JSON.stringify([{
          Config: { Image: 'image:test', Labels: expectedDockerLabels('image:test') },
          State: { Running: false },
          Mounts: [{ Type: 'bind', Source: workspacePath, Destination: '/workspace', RW: true }],
        }]));
      }
      if (args[0] === 'inspect') return ok(JSON.stringify([{ Config: { Image: 'image:test', Labels: expectedDockerLabels('image:test') }, State: { Running: true } }]));
      return ok(args[0] === 'run' ? 'container-id' : '');
    });

    await ensureDockerContainer({ config, imageRef: 'image:test', run });

    expect(calls.map((args) => args[0]).slice(0, 5)).toEqual(['inspect', 'start', 'inspect', 'rm', 'run']);
  });

  it('reuses existing Docker containers only when effective bind mounts match', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'sero-docker-ws-'));
    const sharedPath = mkdtempSync(path.join(tmpdir(), 'sero-docker-shared-'));
    const config = {
      workspaceId: 'ws-1',
      hostPath: workspacePath,
      writableMounts: [sharedPath],
      readOnlyMounts: [],
    };
    const run = vi.fn(async (args: string[]) => {
      expect(args).toEqual(['inspect', 'sero-ws-1']);
      return ok(JSON.stringify([{
        Config: { Image: 'image:test', Labels: expectedDockerLabels('image:test') },
        Image: 'image-id',
        State: { Running: true },
        Mounts: [
          { Type: 'bind', Source: workspacePath, Destination: '/workspace', RW: true },
          { Type: 'bind', Source: sharedPath, Destination: sharedPath, RW: true },
        ],
      }]));
    });

    await expect(ensureDockerContainer({ config, imageRef: 'image:test', imageId: 'image-id', run }))
      .resolves.toMatchObject({ id: 'sero-ws-1', state: 'running' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('recreates existing Docker containers when bind mounts differ', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'sero-docker-ws-'));
    const sharedPath = mkdtempSync(path.join(tmpdir(), 'sero-docker-shared-'));
    const calls: string[][] = [];
    const config = {
      workspaceId: 'ws-1',
      hostPath: workspacePath,
      writableMounts: [sharedPath],
      readOnlyMounts: [],
    };
    const run = vi.fn(async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'inspect' && calls.filter((call) => call[0] === 'inspect').length === 1) {
        return ok(JSON.stringify([{
          Config: { Image: 'image:test', Labels: expectedDockerLabels('image:test') },
          Image: 'image-id',
          State: { Running: true },
          Mounts: [{ Type: 'bind', Source: workspacePath, Destination: '/workspace', RW: true }],
        }]));
      }
      if (args[0] === 'inspect') {
        return ok(JSON.stringify([{
          Config: { Image: 'image:test', Labels: expectedDockerLabels('image:test') },
          State: { Running: true },
          Mounts: [
            { Type: 'bind', Source: workspacePath, Destination: '/workspace', RW: true },
            { Type: 'bind', Source: sharedPath, Destination: sharedPath, RW: true },
          ],
        }]));
      }
      return ok(args[0] === 'run' ? 'container-id' : '');
    });

    await ensureDockerContainer({ config, imageRef: 'image:test', imageId: 'image-id', run });

    expect(calls.map((args) => args[0]).slice(0, 3)).toEqual(['inspect', 'rm', 'run']);
    expect(calls.at(-1)?.[0]).toBe('inspect');
    expect(calls.some((args) => args[0] === 'exec' && args.slice(2, 6).join(' ') === 'git config --global push.autoSetupRemote')).toBe(true);
    expect(calls.find((args) => args[0] === 'run')).toEqual(expect.arrayContaining([
      '--mount', `type=bind,source=${sharedPath},target=${sharedPath}`,
    ]));
  });

  it('recreates existing Docker containers when readonly mode differs', async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), 'sero-docker-ws-'));
    const readonlyPath = mkdtempSync(path.join(tmpdir(), 'sero-docker-readonly-'));
    const calls: string[][] = [];
    const config = {
      workspaceId: 'ws-1',
      hostPath: workspacePath,
      readOnlyMounts: [readonlyPath],
    };
    const run = vi.fn(async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'inspect' && calls.filter((call) => call[0] === 'inspect').length === 1) {
        return ok(JSON.stringify([{
          Config: { Image: 'image:test', Labels: expectedDockerLabels('image:test') },
          State: { Running: true },
          Mounts: [
            { Type: 'bind', Source: workspacePath, Destination: '/workspace', RW: true },
            { Type: 'bind', Source: readonlyPath, Destination: readonlyPath, RW: true },
          ],
        }]));
      }
      if (args[0] === 'inspect') return ok(JSON.stringify([{ Config: { Image: 'image:test', Labels: expectedDockerLabels('image:test') }, State: { Running: true } }]));
      return ok(args[0] === 'run' ? 'container-id' : '');
    });

    await ensureDockerContainer({ config, imageRef: 'image:test', run });

    expect(calls.map((args) => args[0]).slice(0, 3)).toEqual(['inspect', 'rm', 'run']);
    expect(calls.at(-1)?.[0]).toBe('inspect');
    expect(calls.some((args) => args[0] === 'exec' && args.slice(2, 6).join(' ') === 'git config --global push.autoSetupRemote')).toBe(true);
    expect(calls.find((args) => args[0] === 'run')).toEqual(expect.arrayContaining([
      '--mount', `type=bind,source=${readonlyPath},target=${readonlyPath},readonly`,
    ]));
  });

  it('finds the local Dockerfile when Electron starts from apps/desktop', () => {
    const previousCwd = process.cwd();
    const projectDir = mkdtempSync(path.join(tmpdir(), 'sero-desktop-cwd-test-'));
    const imagesDir = path.join(projectDir, 'images');
    mkdirSync(imagesDir, { recursive: true });
    writeFileSync(path.join(imagesDir, 'Dockerfile.sero-node'), 'FROM scratch\n');

    try {
      process.chdir(projectDir);
      expect(dockerImagesDir().replace(/\\\\/g, '/')).toMatch(/\/sero-desktop-cwd-test-[^/]+\/images$/);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('ensures image with inspect hit, pull success, build fallback, and failure', async () => {
    const imagesDir = mkdtempSync(path.join(tmpdir(), 'sero-image-test-'));
    writeFileSync(path.join(imagesDir, 'Dockerfile.sero-node'), 'FROM scratch\n');

    await expect(ensureDockerImage({ imageRef: 'image:local', run: sequence([imageInspect('local-id'), ok('toolchain')]), imagesDir }))
      .resolves.toMatchObject({ source: 'local', imageId: 'local-id' });
    await expect(ensureDockerImage({ imageRef: 'image:pull', run: sequence([fail('missing'), ok('pull'), imageInspect('pull-id'), ok('toolchain')]), imagesDir }))
      .resolves.toMatchObject({ source: 'pulled', imageId: 'pull-id' });
    await expect(ensureDockerImage({ imageRef: 'image:build', run: sequence([fail('missing'), fail('offline'), ok('build'), imageInspect('build-id'), ok('toolchain')]), imagesDir }))
      .resolves.toMatchObject({ source: 'built', imageId: 'build-id' });
    await expect(ensureDockerImage({ imageRef: 'image:fail', run: sequence([fail('missing'), fail('offline'), fail('bad build')]), imagesDir }))
      .rejects.toThrow('local build failed');
  });

  it('rebuilds a stale local image that lacks the runtime toolchain', async () => {
    const imagesDir = mkdtempSync(path.join(tmpdir(), 'sero-image-stale-test-'));
    const calls: string[][] = [];
    writeFileSync(path.join(imagesDir, 'Dockerfile.sero-node'), 'FROM scratch\n');

    await expect(ensureDockerImage({
      imageRef: 'image:stale',
      imagesDir,
      run: vi.fn(async (args: string[]) => {
        calls.push(args);
        if (args[0] === 'image') return imageInspect(calls.some((call) => call[0] === 'build') ? 'fresh-id' : 'stale-id');
        if (args[0] === 'pull') return ok('already latest');
        if (args[0] === 'build') return ok('built fresh');
        if (args[0] === 'run') return calls.some((call) => call[0] === 'build') ? ok('toolchain') : fail('missing /ms-playwright');
        return fail('unexpected');
      }),
    })).resolves.toMatchObject({ source: 'built', imageId: 'fresh-id' });

    expect(calls.map((args) => args[0])).toEqual(['image', 'run', 'pull', 'image', 'run', 'build', 'image', 'run']);
  });

  it('uses the shared latest fallback image when no pinned tag is configured', async () => {
    const calls: string[][] = [];
    const run: DockerRunner = vi.fn(async (args: string[]) => {
      calls.push(args);
      return args[0] === 'image' ? imageInspect('latest-id') : ok('toolchain');
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
        if (args[0] === 'image' && args[1] === 'inspect' && calls.some((call) => call[0] === 'build')) return imageInspect('built-pinned-id');
        if (args[0] === 'run') return ok('toolchain');
        return fail('missing');
      }),
    });

    expect(calls.find((args) => args[0] === 'build')).toEqual(expect.arrayContaining([
      '-t', 'ghcr.io/sero-labs/sero-node:0.1.0',
      '--build-arg', 'SERO_NODE_VERSION=0.1.0',
    ]));
  });

  it('emits dev-server registration and unregistration events', async () => {
    const server: RuntimeDevServer = {
      id: 'ws-1:workspace:root:5173',
      port: 5173,
      url: 'http://127.0.0.1:51000',
      command: 'pnpm dev',
      cwd: '/workspace',
    };
    const ports = {
      detectPorts: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([5173]),
      forwardPort: vi.fn().mockResolvedValue({ targetPort: 5173, hostPort: 51000, url: server.url, bridged: true }),
      registerServer: vi.fn().mockReturnValue(server),
      getServer: vi.fn().mockReturnValue(server),
      stopForward: vi.fn().mockResolvedValue(undefined),
      deleteServer: vi.fn().mockReturnValue(true),
    };
    const backend = new DockerBackend({
      workspaceId: 'ws-1',
      hostWorkspacePath: '/tmp/sero-docker-workspace',
      workspaceManager: { getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'docker', previewPortPoolSize: 2 }) } as unknown as WorkspaceManager,
      run: vi.fn(async () => ok()),
    });
    vi.spyOn(backend, 'ensure').mockResolvedValue({
      backend: 'docker',
      workspaceId: 'ws-1',
      hostWorkspacePath: '/tmp/sero-docker-workspace',
      runtimeWorkspacePath: '/workspace',
      state: 'running',
    });
    Object.assign(backend as unknown as { ports: typeof ports }, { ports });
    const events: unknown[] = [];
    backend.onDevServerChange((event) => events.push(event));

    const started = await backend.startDevServer({ command: 'pnpm dev', cwd: '/workspace' });
    await backend.stopDevServer({ serverId: started.id });

    expect(events).toEqual([
      expect.objectContaining({ type: 'registered', workspaceId: 'ws-1', serverId: server.id, status: 'running' }),
      expect.objectContaining({ type: 'unregistered', workspaceId: 'ws-1', serverId: server.id, status: 'stopped' }),
    ]);
  });

  it('preserves dev-server metadata on restart', async () => {
    const server: RuntimeDevServer = {
      id: 'ws-1:card-preview:card-1:5173',
      port: 5173,
      url: 'http://127.0.0.1:51000',
      command: 'pnpm dev',
      cwd: '/workspace/app',
      name: 'Card Preview',
      framework: 'vite',
      scope: 'card-preview',
      cardId: 'card-1',
    };
    const backend = new DockerBackend({
      workspaceId: 'ws-1',
      hostWorkspacePath: '/tmp/sero-docker-workspace',
      workspaceManager: { getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'docker', previewPortPoolSize: 2 }) } as unknown as WorkspaceManager,
      run: vi.fn(async () => ok()),
    });
    Object.assign(backend as unknown as { ports: { getServer: (id: string) => RuntimeDevServer | undefined } }, {
      ports: { getServer: vi.fn().mockReturnValue(server) },
    });
    vi.spyOn(backend, 'stopDevServer').mockResolvedValue(undefined);
    const start = vi.spyOn(backend, 'startDevServer').mockResolvedValue(server);

    await backend.restartDevServer({ serverId: server.id });

    expect(start).toHaveBeenCalledWith({
      command: 'pnpm dev',
      cwd: '/workspace/app',
      name: 'Card Preview',
      framework: 'vite',
      scope: 'card-preview',
      cardId: 'card-1',
    });
  });

  it('passes isolated exec requests into the first container config build', async () => {
    vi.mocked(buildWorkspaceContainerConfig).mockClear();
    let inspectCount = 0;
    const run: DockerRunner = vi.fn(async (args: string[]) => {
      if (args[0] === 'image') return ok('[]');
      if (args[0] === 'inspect') {
        inspectCount += 1;
        if (inspectCount === 1) return fail('not found');
        return ok(JSON.stringify([{ Config: { Image: 'image', Labels: {} }, State: { Running: true }, NetworkSettings: { Ports: { '32000/tcp': [{ HostPort: '49153' }], '32001/tcp': [{ HostPort: '49154' }] } } }]));
      }
      return ok(args[0] === 'run' ? 'container-id' : '');
    });
    const workspaceManager = { getRuntimeConfig: vi.fn().mockResolvedValue({ backend: 'docker', previewPortPoolSize: 2 }) } as unknown as WorkspaceManager;
    const backend = new DockerBackend({
      workspaceId: 'ws-1',
      hostWorkspacePath: '/tmp/sero-docker-workspace',
      workspaceManager,
      run,
    });

    await backend.exec({ command: 'echo isolated', isolated: true });

    expect(buildWorkspaceContainerConfig).toHaveBeenCalledWith(
      workspaceManager,
      'ws-1',
      '/tmp/sero-docker-workspace',
      { isolated: true },
    );
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

function expectedDockerLabels(imageRef: string): Record<string, string> {
  return {
    'ai.sero.managed': 'true',
    'ai.sero.runtime': 'docker',
    'ai.sero.workspaceId': 'ws-1',
    'ai.sero.image': imageRef,
  };
}

function ok(stdout = ''): DockerCommandResult {
  return { stdout, stderr: '', exitCode: 0 };
}

function imageInspect(id: string): DockerCommandResult {
  return ok(JSON.stringify([{ Id: id }]));
}

function fail(stderr = 'failed'): DockerCommandResult {
  return { stdout: '', stderr, exitCode: 1 };
}

function sequence(results: DockerCommandResult[]): DockerRunner {
  const run = vi.fn(async () => results.shift() ?? ok());
  return run;
}
