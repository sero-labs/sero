/**
 * End-to-end container verification for complete command output.
 *
 * Runs the real `docker exec` streaming path against a real workspace
 * container, with the capture root mounted exactly as the container config builds
 * it. The whole file skips when Docker or the Sero image is unavailable, so a
 * machine without either still runs the rest of the suite.
 */

import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OutputCapture } from '@electron/features/tool-capture/capture';
import { formatMount, type DockerMount } from '@electron/features/workspace/runtime/backends/docker/docker-mounts';
import { streamDocker } from '@electron/features/workspace/runtime/backends/docker/docker-cli';

const execFileAsync = promisify(execFile);

const IMAGE = 'ghcr.io/sero-labs/sero-node:latest';
const CONTAINER = `sero-tool-capture-e2e-${process.pid}`;
const SESSION = 'session-container-e2e';

let available = false;
let captureRoot = '';
let workspacePath = '';

async function docker(args: string[], timeoutMs = 30_000): Promise<string> {
  const { stdout } = await execFileAsync('docker', args, { timeout: timeoutMs });
  return stdout;
}

async function dockerAvailable(): Promise<boolean> {
  // A busy daemon can miss the first probe, so retry before giving up. The
  // caller treats a false result as a hard failure once SERO_DOCKER_E2E is set.
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
  try {
    await docker(['rm', '-f', CONTAINER], 60_000);
  } catch {
    // Nothing to remove.
  }
}

function containerMounts(): string[] {
  const mounts: DockerMount[] = [
    { source: workspacePath, target: '/workspace' },
    { source: captureRoot, target: captureRoot, readonly: true },
  ];
  return mounts.flatMap((mount) => ['--mount', formatMount(mount)]);
}

async function runInContainer(command: string): Promise<{ capture: OutputCapture; exitCode: number }> {
  if (!captureRoot) throw new Error('The capture root was not prepared before the run.');
  const capture = new OutputCapture({
    producerSessionId: SESSION,
    captureRoot,
    toRuntimePath: (hostPath) => hostPath.replace(/\\/g, '/'),
  });
  const result = await streamDocker(
    ['exec', '-w', '/workspace', CONTAINER, 'sh', '-lc', command],
    { timeoutMs: 120_000 },
    {
      write: (stream, chunk) => capture.write(stream, chunk),
      close: () => {},
    },
  );
  return { capture, exitCode: result.exitCode };
}

describe.skipIf(!process.env.SERO_DOCKER_E2E)('complete command output in a workspace container', () => {
  beforeAll(async () => {
    // Fail rather than run with an empty capture root: a relative root would
    // write captures into the repository working directory.
    available = await dockerAvailable();
    if (!available) {
      throw new Error('SERO_DOCKER_E2E is set but Docker or the Sero image is unavailable.');
    }

    captureRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-container-capture-'));
    workspacePath = await mkdtemp(path.join(os.tmpdir(), 'sero-container-ws-'));
    await removeContainer();
    await docker([
      'run', '-d', '--name', CONTAINER, '--init',
      '--workdir', '/workspace',
      '--env', 'HOME=/tmp/sero-home',
      ...containerMounts(),
      IMAGE,
      'sleep', 'infinity',
    ], 120_000);
    // Give the container a moment to be exec-ready.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }, 240_000);

  afterAll(async () => {
    await removeContainer();
    await rm(captureRoot, { recursive: true, force: true });
    await rm(workspacePath, { recursive: true, force: true });
  });

  it('captures output above both limits from a container command', async () => {
    const { capture, exitCode } = await runInContainer("seq 1 5000 | sed 's/$/xxxxxxxxxxxxxxxx/'");
    const record = await capture.finish();

    expect(exitCode).toBe(0);
    expect(record).toMatchObject({ complete: true, producerSessionId: SESSION });
    expect(record?.combined?.bytes).toBeGreaterThan(50 * 1024);
    expect((await stat(record?.combined?.hostPath as string)).size).toBe(record?.combined?.bytes);
    expect(capture.renderPayload().content).toContain('xxxxxxxxxxxxxxxx');
  });

  it('keeps stdout and stderr byte-exact inside the container', async () => {
    const { capture, exitCode } = await runInContainer("printf '{\"ok\":true}\\n'; printf 'warn\\n' >&2; exit 2");
    const record = await capture.finish();

    expect(exitCode).toBe(2);
    expect(await readFile(record?.stdout?.hostPath as string, 'utf8')).toBe('{"ok":true}\n');
    expect(await readFile(record?.stderr?.hostPath as string, 'utf8')).toBe('warn\n');
  });

  it('lets the container read the reported path and refuses writes to the capture root', async () => {
    const { capture } = await runInContainer("printf 'readable from inside\\n'");
    const record = await capture.finish();
    const runtimePath = record?.combined?.runtimePath as string;

    expect(await docker(['exec', CONTAINER, 'cat', runtimePath], 30_000)).toBe('readable from inside\n');

    let writeFailure = '';
    try {
      await docker(['exec', CONTAINER, 'touch', `${runtimePath}.evil`], 30_000);
    } catch (error) {
      writeFailure = String((error as { stderr?: string }).stderr ?? error);
    }
    expect(writeFailure).toContain('Read-only file system');
  });
});
