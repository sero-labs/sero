import { EventEmitter } from 'events';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const childProcessMocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('child_process', () => childProcessMocks);

import { augmentedDockerPath, resolveDockerCommand, runDocker, spawnDocker } from '@electron/features/workspace/runtime/backends/docker/docker-cli';

describe('Docker CLI helpers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, PATH: '/custom/bin' };
    delete process.env.SERO_DOCKER_BIN;
    delete process.env.DOCKER_BIN;
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
      '/usr/bin',
      '/bin',
    ]));
  });

  it('honors SERO_DOCKER_BIN before DOCKER_BIN and otherwise falls back to docker', () => {
    expect(resolveDockerCommand().executable).toBe('docker');

    process.env.DOCKER_BIN = '/opt/docker/bin/docker';
    expect(resolveDockerCommand().executable).toBe('/opt/docker/bin/docker');

    process.env.SERO_DOCKER_BIN = '/custom/docker';
    expect(resolveDockerCommand().executable).toBe('/custom/docker');
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
