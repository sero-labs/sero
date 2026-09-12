import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HostBackend } from '@electron/features/workspace/runtime/backends/host/host-backend';
import { SERO_AGENT_DIR, SERO_CAPTURE_ROOT } from '@electron/platform/env';

const tempDirs: string[] = [];
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe('capture root reachability from the host backend', () => {
  beforeEach(() => {
    process.env.PI_CODING_AGENT_DIR = SERO_AGENT_DIR;
  });

  afterEach(async () => {
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('resolves the capture root under the agent directory, outside every workspace', async () => {
    const workspacePath = await tempDir('sero-tool-capture-workspace-');

    expect(path.resolve(SERO_CAPTURE_ROOT).startsWith(path.resolve(SERO_AGENT_DIR))).toBe(true);
    expect(path.relative(workspacePath, path.resolve(SERO_CAPTURE_ROOT)).startsWith('..')).toBe(true);
  });

  it('reads a capture file through the host backend while refusing an unrelated path', async () => {
    const workspacePath = await tempDir('sero-tool-capture-workspace-');
    const backend = new HostBackend({ workspaceId: 'workspace-a', hostWorkspacePath: workspacePath });

    const captureFile = path.join(SERO_CAPTURE_ROOT, 'session-a', 'capture-1', 'combined.log');
    await mkdir(path.dirname(captureFile), { recursive: true });
    await writeFile(captureFile, 'complete output\n', 'utf8');

    await expect(backend.readFile({ path: captureFile })).resolves.toMatchObject({ content: 'complete output\n' });

    const outsidePath = path.join(await tempDir('sero-tool-capture-outside-'), 'secret.txt');
    await writeFile(outsidePath, 'nope', 'utf8');
    await expect(backend.readFile({ path: outsidePath })).rejects.toThrow(/inside a workspace root/);
  });
});
