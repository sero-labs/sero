/**
 * End-to-end host verification for complete command output.
 *
 * Uses the real HostBackend, the real bash tool and the real filesystem, so the
 * chain from `runtime.exec` streaming through the capture owner to the reported
 * path is exercised the way a session exercises it.
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => {
  const root = `/tmp/sero-vitest/${process.pid}-bash-e2e-${Math.random().toString(16).slice(2)}`;
  return {
    SERO_AGENT_DIR: `${root}/agent`,
    SERO_FIXED_ROOT: root,
    SERO_HOST_ARTIFACTS_ROOT: root,
    SERO_HOME: root,
    SERO_CAPTURE_ROOT: `${root}/agent/captures`,
    SERO_HOST_RTK_STATE_ROOT: `${root}/agent/rtk`,
  };
});

vi.mock('@electron/platform/env', () => envMock);

import { HostBackend } from '@electron/features/workspace/runtime/backends/host/host-backend';
import { createBash } from '@electron/features/container/tools/tools-coding';
import { clearToolResultsForTests, readToolResult } from '@electron/features/tool-capture/tool-results';
import type { ToolCaptureRecord } from '@electron/features/tool-capture/types';

const SESSION = 'session-e2e';
const tempDirs: string[] = [];
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

async function createWorkspace(): Promise<{ backend: HostBackend; workspacePath: string }> {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), 'sero-bash-e2e-'));
  tempDirs.push(workspacePath);
  return {
    workspacePath,
    backend: new HostBackend({ workspaceId: 'ws-e2e', hostWorkspacePath: workspacePath }),
  };
}

function run(
  backend: HostBackend,
  workspacePath: string,
  command: string,
  toolCallId: string,
): Promise<unknown> {
  const bash = createBash(backend, workspacePath, SESSION);
  return bash.execute(toolCallId, { command }, undefined, undefined, undefined as never);
}

function textBlocks(result: unknown): string[] {
  const content = (result as { content: Array<{ type: string; text?: string }> }).content;
  return content.filter((block) => block.type === 'text').map((block) => block.text ?? '');
}

function captureOf(result: unknown): ToolCaptureRecord | undefined {
  return (result as { details?: { capture?: ToolCaptureRecord } }).details?.capture;
}

beforeEach(async () => {
  // The host read tool resolves its allowed roots from the process environment,
  // which the app sets at startup from the same agent directory.
  process.env.PI_CODING_AGENT_DIR = envMock.SERO_AGENT_DIR;
  clearToolResultsForTests();
  await rm(envMock.SERO_FIXED_ROOT, { recursive: true, force: true });
  await mkdir(envMock.SERO_AGENT_DIR, { recursive: true });
});

afterEach(async () => {
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  clearToolResultsForTests();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  await rm(envMock.SERO_FIXED_ROOT, { recursive: true, force: true });
});

describe('complete command output on the host backend', () => {
  it('captures output above both presentation limits and reports a readable path', async () => {
    const { backend, workspacePath } = await createWorkspace();
    // 5,000 lines and roughly 170 KB: above both the line and byte limits.
    const result = await run(backend, workspacePath, "seq 1 5000 | sed 's/$/xxxxxxxxxxxxxxxx/'", 'call-1');

    const blocks = textBlocks(result);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain('[Showing lines');
    expect(blocks[1]).toContain('Complete output:');

    const capture = captureOf(result);
    expect(capture).toMatchObject({ complete: true, producerSessionId: SESSION });
    expect(capture?.combined?.bytes).toBeGreaterThan(50 * 1024);

    // The agent's normal read tool resolves the reported path.
    const content = await readFile(capture?.combined?.hostPath as string, 'utf8');
    expect(content).toBe((await backend.readFile({ path: capture?.combined?.hostPath as string })).content);
    expect(content.trimEnd().split('\n')).toHaveLength(5000);
    expect(content.trimEnd().split('\n')[0]).toBe('1xxxxxxxxxxxxxxxx');
  });

  it('captures output above the former 10 MB runtime buffer limit', async () => {
    const { backend, workspacePath } = await createWorkspace();
    const result = await run(backend, workspacePath, 'head -c 11000000 /dev/zero | tr "\\0" "y"', 'call-2');

    const capture = captureOf(result);
    expect(capture?.combined?.bytes).toBe(11_000_000);
    expect((await stat(capture?.combined?.hostPath as string)).size).toBe(11_000_000);

    // The model-facing payload is still bounded.
    const payload = textBlocks(result)[0];
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThan(60 * 1024);
  });

  it('keeps stdout and stderr exact and separate for a failing command', async () => {
    const { backend, workspacePath } = await createWorkspace();
    const bash = createBash(backend, workspacePath, SESSION);

    await expect(bash.execute('call-3', {
      command: 'printf \'{"ok":true}\\n\'; printf \'warning: slow\\n\' >&2; exit 3',
    }, undefined, undefined, undefined as never)).rejects.toThrow(/Command exited with code 3[\s\S]*Complete output:/);

    const presentation = readToolResult('call-3');
    const capture = presentation?.details.capture as ToolCaptureRecord | undefined;
    expect(capture).toMatchObject({ complete: true });
    expect(presentation?.details.exitCode).toBe(3);

    // The rejection path would have dropped these; the hook restores them.
    expect(presentation?.content).toHaveLength(2);
    expect(await readFile(capture?.stdout?.hostPath as string, 'utf8')).toBe('{"ok":true}\n');
    expect(await readFile(capture?.stderr?.hostPath as string, 'utf8')).toBe('warning: slow\n');
  });

  it('creates no capture for a command with no output', async () => {
    const { backend, workspacePath } = await createWorkspace();
    const result = await run(backend, workspacePath, 'true', 'call-4');

    expect(captureOf(result)).toBeUndefined();
    expect(textBlocks(result)).toEqual(['(no output)']);
  });

  it('preserves the bounded result when the capture cannot be written', async () => {
    const { backend, workspacePath } = await createWorkspace();
    // A file where the capture root belongs makes every capture write fail.
    await rm(envMock.SERO_CAPTURE_ROOT, { recursive: true, force: true });
    await writeFile(envMock.SERO_CAPTURE_ROOT, 'not-a-directory');

    const bash = createBash(backend, workspacePath, SESSION);
    await expect(bash.execute('call-5', {
      command: 'printf \'some output\\n\'; exit 7',
    }, undefined, undefined, undefined as never)).rejects.toThrow(/Command exited with code 7/);

    const presentation = readToolResult('call-5');
    const capture = presentation?.details.capture as ToolCaptureRecord | undefined;

    // The result survives, the failure is explicit, and no path is advertised.
    expect(presentation?.details.exitCode).toBe(7);
    expect(capture).toMatchObject({ complete: false });
    expect(capture?.combined).toBeUndefined();
    expect(presentation?.content[0]?.text).toContain('some output');
    expect(presentation?.content.some((block) => block.text.includes('Complete output unavailable'))).toBe(true);
  });
});
