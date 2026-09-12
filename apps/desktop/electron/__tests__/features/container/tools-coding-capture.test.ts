import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const testEnv = vi.hoisted(() => {
  const root = `/tmp/sero-vitest/${process.pid}-bash-capture-${Math.random().toString(16).slice(2)}`;
  return {
    SERO_AGENT_DIR: `${root}/agent`,
    SERO_FIXED_ROOT: root,
    SERO_HOST_ARTIFACTS_ROOT: root,
    SERO_HOME: root,
    SERO_CAPTURE_ROOT: `${root}/agent/captures`,
  };
});

vi.mock('@electron/platform/env', () => testEnv);

import type { RuntimeBackend, RuntimeExecInput } from '@electron/features/workspace/runtime/types';
import { getRuntimeCapabilities } from '@electron/features/workspace/runtime/capabilities';
import { createBash } from '@electron/features/container/tools/tools-coding';
import { clearToolResultsForTests, readToolResult } from '@electron/features/tool-capture/tool-results';
import { registerToolResultPresentation } from '@electron/features/tool-capture/tool-result-presentation';
import type { ToolCaptureRecord } from '@electron/features/tool-capture/types';
import { toRuntimeIdentityMountPath } from '@electron/features/workspace/runtime/runtime-paths';

const SESSION = 'session-a';

interface RuntimeHarness {
  runtime: RuntimeBackend;
  inputs: RuntimeExecInput[];
}

function runtimeHarness(result: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}): RuntimeHarness {
  const inputs: RuntimeExecInput[] = [];
  const runtime = {
    backend: 'apple-container' as const,
    workspaceId: 'ws-1',
    hostWorkspacePath: '/host/workspace',
    runtimeWorkspacePath: '/workspace',
    workspaceAccess: 'live-mount' as const,
    capabilities: getRuntimeCapabilities('apple-container', 'darwin', 'arm64'),
    health: vi.fn(),
    ensure: vi.fn(),
    destroy: vi.fn(),
    exec: vi.fn(async (input: RuntimeExecInput) => {
      inputs.push(input);
      // Emulate a streaming runtime: the sink receives the bytes and the result
      // carries status only.
      if (result.stdout) input.outputSink?.write('stdout', result.stdout);
      if (result.stderr) input.outputSink?.write('stderr', result.stderr);
      input.outputSink?.close();
      return { stdout: '', stderr: '', exitCode: result.exitCode ?? 0 };
    }),
    execFile: vi.fn(),
    isSshAvailable: vi.fn(),
    spawn: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    listFiles: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
    createFile: vi.fn(),
    createDirectory: vi.fn(),
    watchFiles: vi.fn(),
    createTerminal: vi.fn(),
    startDevServer: vi.fn(),
    stopDevServer: vi.fn(),
    restartDevServer: vi.fn(),
    getDevServerStatus: vi.fn(),
    forwardPort: vi.fn(),
    stopForward: vi.fn(),
    resolvePreviewUrl: vi.fn(),
  } as unknown as RuntimeBackend;
  return { runtime, inputs };
}

function textBlocks(result: unknown): string[] {
  const content = (result as { content: Array<{ type: string; text?: string }> }).content;
  return content.filter((block) => block.type === 'text').map((block) => block.text ?? '');
}

const roots: string[] = [];

afterEach(() => {
  clearToolResultsForTests();
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('bash tool complete-output capture', () => {
  it('streams output into the sink and returns separate payload and report blocks', async () => {
    const harness = runtimeHarness({ stdout: 'hello\nworld\n' });
    const bash = createBash(harness.runtime, undefined, SESSION);

    await bash.execute('call-1', { command: 'echo hello' }, undefined, undefined, undefined as never);

    expect(harness.inputs.at(-1)?.outputSink).toBeDefined();
    const result = await bash.execute('call-2', { command: 'echo hello' }, undefined, undefined, undefined as never);
    const blocks = textBlocks(result);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe('hello\nworld');
    expect(blocks[1]).toContain('Complete output:');

    const details = (result as { details: { capture?: ToolCaptureRecord; blocks: Record<string, number> } }).details;
    expect(details.blocks).toEqual({ payload: 0, report: 1 });
    expect(details.capture).toMatchObject({ complete: true, producerSessionId: SESSION });
    expect(details.capture?.stdout?.bytes).toBe(12);
    expect(fs.existsSync(details.capture?.combined?.hostPath as string)).toBe(true);
  });

  it('reports runtime paths in the model text and host paths only in details', async () => {
    const harness = runtimeHarness({ stdout: 'hello\n' });
    const bash = createBash(harness.runtime, undefined, SESSION);

    const result = await bash.execute('call-1', { command: 'echo hello' }, undefined, undefined, undefined as never);
    const details = (result as { details: { capture: ToolCaptureRecord } }).details;

    // The container backend renders the reported path through the identity
    // helper. A POSIX host path maps to itself; the Windows drive mapping is
    // covered by the capture unit test.
    expect(details.capture.combined?.runtimePath).toBe(toRuntimeIdentityMountPath(details.capture.combined?.hostPath as string));
    const blocks = textBlocks(result);
    // The report carries the runtime-valid path; the payload carries output only.
    expect(blocks[1]).toContain(details.capture.combined?.runtimePath as string);
    expect(blocks[0]).not.toContain(details.capture.combined?.runtimePath as string);
  });

  it('creates no capture and no report block when the command writes nothing', async () => {
    const harness = runtimeHarness({ stdout: '', exitCode: 0 });
    const bash = createBash(harness.runtime, undefined, SESSION);

    const result = await bash.execute('call-1', { command: 'true' }, undefined, undefined, undefined as never);
    const details = (result as { details: { capture?: unknown; blocks: Record<string, number> } }).details;

    expect(textBlocks(result)).toEqual(['(no output)']);
    expect(details.capture).toBeUndefined();
    expect(details.blocks).toEqual({ payload: 0 });
  });

  it('keeps the payload within the existing limits and marks a preview', async () => {
    const line = `${'y'.repeat(200)}\n`;
    const harness = runtimeHarness({ stdout: line.repeat(4000) });
    const bash = createBash(harness.runtime, undefined, SESSION);

    const result = await bash.execute('call-1', { command: 'big' }, undefined, undefined, undefined as never);
    const payload = textBlocks(result)[0];

    expect(payload).toMatch(/\[Showing lines \d+-\d+ of \d+/);
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThan(80 * 1024);
    const details = (result as { details: { capture: ToolCaptureRecord } }).details;
    expect(details.capture.combined?.bytes).toBe(Buffer.byteLength(line.repeat(4000)));
  });

  it('preserves capture metadata for a failed command without changing isError semantics', async () => {
    const harness = runtimeHarness({ stdout: 'ok\n', stderr: 'boom\n', exitCode: 1 });
    const bash = createBash(harness.runtime, undefined, SESSION);

    await expect(bash.execute('call-1', { command: 'false' }, undefined, undefined, undefined as never))
      .rejects.toThrow(/Command exited with code 1[\s\S]*Complete output:/);

    const record = readToolResult('call-1')?.details.capture as ToolCaptureRecord | undefined;
    expect(record).toMatchObject({ complete: true });
    expect(record?.stderr?.bytes).toBe(5);

    // The tool_result hook restores the presentation the rejection path drops.
    const handlers = new Map<string, (event: unknown) => unknown>();
    registerToolResultPresentation({
      on: (name: string, handler: (event: unknown) => unknown) => { handlers.set(name, handler); },
    } as never);
    const restored = handlers.get('tool_result')?.({
      toolName: 'bash', toolCallId: 'call-1', content: [], details: {}, isError: true,
    }) as { content?: Array<{ text?: string }>; details?: { capture?: ToolCaptureRecord }; isError?: boolean } | undefined;

    expect(restored?.details?.capture).toMatchObject({ complete: true });
    expect(restored?.details).toMatchObject({ exitCode: 1 });
    expect(restored?.content).toHaveLength(2);
    expect(restored?.isError).toBeUndefined();
  });

  it('notes a timeout without claiming the command completed', async () => {
    const harness = runtimeHarness({ stdout: 'partial\n', exitCode: 124 });
    const bash = createBash(harness.runtime, undefined, SESSION);

    await expect(bash.execute('call-1', { command: 'sleep 99', timeout: 30 }, undefined, undefined, undefined as never))
      .rejects.toThrow(/Command timed out after 30s/);
  });

  it('advertises no path and reports the failure when persistence fails', async () => {
    fs.mkdirSync(testEnv.SERO_AGENT_DIR, { recursive: true });
    // A file where the capture root belongs makes every capture open fail.
    fs.rmSync(testEnv.SERO_CAPTURE_ROOT, { recursive: true, force: true });
    fs.writeFileSync(testEnv.SERO_CAPTURE_ROOT, 'not-a-directory');
    const harness = runtimeHarness({ stdout: 'output\n', exitCode: 1 });
    const bash = createBash(harness.runtime, undefined, SESSION);

    await expect(bash.execute('call-1', { command: 'false' }, undefined, undefined, undefined as never))
      .rejects.toThrow(/Complete output unavailable/);

    const record = readToolResult('call-1')?.details.capture as ToolCaptureRecord | undefined;
    expect(record).toMatchObject({ complete: false });
    expect(record?.combined).toBeUndefined();
    expect(record?.unavailableReason).toBeTruthy();
  });
});
