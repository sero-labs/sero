import { EventEmitter } from 'events';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const childProcessMocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('child_process', () => childProcessMocks);

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn<(path: string) => boolean>(),
}));

vi.mock('fs', () => fsMocks);

import { augmentedDockerPath, resolveDockerCommand, runDocker, spawnDocker } from '@electron/features/workspace/runtime/backends/docker/docker-cli';

describe('Docker CLI helpers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, PATH: '/custom/bin' };
    delete process.env.SERO_DOCKER_BIN;
    delete process.env.DOCKER_BIN;
    delete process.env.SERO_CONTAINER_ENGINE;
    fsMocks.existsSync.mockReturnValue(false);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('augments PATH with packaged Electron Docker lookup locations', () => {
    const path = augmentedDockerPath('/custom/bin');

    expect(path.split(':')).toEqual(expect.arrayContaining([
      '/custom/bin',
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/opt/podman/bin',
      '/usr/bin',
      '/bin',
    ]));
  });

  it('honors SERO_DOCKER_BIN before DOCKER_BIN and otherwise falls back to docker', () => {
    expect(resolveDockerCommand()).toMatchObject({ executable: 'docker', engine: 'docker' });

    process.env.DOCKER_BIN = '/opt/docker/bin/docker';
    expect(resolveDockerCommand()).toMatchObject({ executable: '/opt/docker/bin/docker', engine: 'docker' });

    process.env.SERO_DOCKER_BIN = '/custom/docker';
    expect(resolveDockerCommand()).toMatchObject({ executable: '/custom/docker', engine: 'docker' });
  });

  it('infers podman engine from an explicit podman binary path', () => {
    process.env.SERO_DOCKER_BIN = '/usr/local/bin/podman';
    expect(resolveDockerCommand()).toMatchObject({ executable: '/usr/local/bin/podman', engine: 'podman' });
  });

  it('auto-detects podman when docker is not on PATH', () => {
    fsMocks.existsSync.mockImplementation((p: string) => p.endsWith('/podman'));

    const resolved = resolveDockerCommand();
    expect(resolved.engine).toBe('podman');
    expect(resolved.executable).toMatch(/podman$/);
  });

  it('prefers docker when both engines are on PATH', () => {
    fsMocks.existsSync.mockImplementation((p: string) => p.endsWith('/docker') || p.endsWith('/podman'));

    const resolved = resolveDockerCommand();
    expect(resolved.engine).toBe('docker');
    expect(resolved.executable).toMatch(/docker$/);
  });

  it('lets SERO_CONTAINER_ENGINE override the docker-first preference', () => {
    fsMocks.existsSync.mockImplementation((p: string) => p.endsWith('/docker') || p.endsWith('/podman'));
    process.env.SERO_CONTAINER_ENGINE = 'podman';

    const resolved = resolveDockerCommand();
    expect(resolved.engine).toBe('podman');
    expect(resolved.executable).toMatch(/podman$/);
  });

  it('uses the same executable and augmented env for runDocker and spawnDocker', async () => {
    process.env.SERO_DOCKER_BIN = '/custom/docker';
    childProcessMocks.execFile.mockImplementationOnce((_bin, _args, _options, cb) => cb(null, 'ok', ''));
    childProcessMocks.spawn.mockReturnValueOnce(new EventEmitter());

    await expect(runDocker(['version'], { env: { PATH: '/env/bin', FOO: 'bar' } })).resolves.toEqual({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    });
    spawnDocker(['ps'], { env: { PATH: '/env/bin', FOO: 'bar' } });

    expect(childProcessMocks.execFile).toHaveBeenCalledWith('/custom/docker', ['version'], expect.objectContaining({
      env: expect.objectContaining({ FOO: 'bar', PATH: expect.stringContaining('/env/bin') }),
    }), expect.any(Function));
    expect(childProcessMocks.spawn).toHaveBeenCalledWith('/custom/docker', ['ps'], expect.objectContaining({
      env: expect.objectContaining({ FOO: 'bar', PATH: expect.stringContaining('/env/bin') }),
      stdio: 'pipe',
    }));
  });

  it('falls back to podman when the auto-selected docker daemon is unavailable', async () => {
    fsMocks.existsSync.mockImplementation((p: string) => p.endsWith('/docker') || p.endsWith('/podman'));
    childProcessMocks.execFile
      .mockImplementationOnce((_bin, _args, _options, cb) => cb({ code: 1, message: 'docker failed' }, '', 'failed to connect to the docker API at unix:///tmp/docker.sock'))
      .mockImplementationOnce((_bin, _args, _options, cb) => cb(null, 'podman ok', ''));

    await expect(runDocker(['info'])).resolves.toEqual({ stdout: 'podman ok', stderr: '', exitCode: 0 });

    expect(childProcessMocks.execFile).toHaveBeenNthCalledWith(1, expect.stringMatching(/docker$/), ['info'], expect.any(Object), expect.any(Function));
    expect(childProcessMocks.execFile).toHaveBeenNthCalledWith(2, expect.stringMatching(/podman$/), ['info'], expect.any(Object), expect.any(Function));
  });

  it('does not fall back to podman for normal docker command failures', async () => {
    fsMocks.existsSync.mockImplementation((p: string) => p.endsWith('/docker') || p.endsWith('/podman'));
    childProcessMocks.execFile.mockImplementationOnce((_bin, _args, _options, cb) => cb({ code: 1, message: 'docker failed' }, '', 'No such image: missing'));

    await expect(runDocker(['image', 'inspect', 'missing'])).resolves.toEqual({ stdout: '', stderr: 'No such image: missing', exitCode: 1 });

    expect(childProcessMocks.execFile).toHaveBeenCalledOnce();
  });

  it('does not fall back to podman when docker is explicitly selected', async () => {
    process.env.SERO_CONTAINER_ENGINE = 'docker';
    fsMocks.existsSync.mockImplementation((p: string) => p.endsWith('/docker') || p.endsWith('/podman'));
    childProcessMocks.execFile.mockImplementationOnce((_bin, _args, _options, cb) => cb({ code: 1, message: 'docker failed' }, '', 'Cannot connect to the Docker daemon'));

    await expect(runDocker(['info'])).resolves.toEqual({ stdout: '', stderr: 'Cannot connect to the Docker daemon', exitCode: 1 });

    expect(childProcessMocks.execFile).toHaveBeenCalledOnce();
  });

  it('normalizes pre-aborted commands without starting Docker work', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(runDocker(['version'], { signal: controller.signal })).resolves.toEqual({
      stdout: '',
      stderr: 'Command aborted.',
      exitCode: 130,
    });
    expect(childProcessMocks.execFile).not.toHaveBeenCalled();
  });
});
