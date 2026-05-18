import { describe, expect, it, vi } from 'vitest';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';
import type { BrowserRuntimeAdapter } from '@electron/features/workspace/runtime/browser-pack/types';
import { createAgentBrowser } from '@electron/features/container/tools/tools-browser-agent';

type ExecInput = { command: string; cwd?: string; timeoutMs?: number };

const adapter: BrowserRuntimeAdapter = {
  browsersPath: '/ms-playwright',
  chromiumExecutableCandidates: ['/ms-playwright/chromium/chrome'],
  ffmpegCandidates: [],
  agentBrowserCandidates: [],
  pathPrefixes: [],
  tempDir: '/tmp/browser-pack',
  env: { PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright' },
};

function createRuntime(execResults: Array<{ stdout: string; stderr: string; exitCode: number }>, readContent = Buffer.from('png').toString('base64')) {
  const exec = vi.fn();
  for (const result of execResults) exec.mockResolvedValueOnce(result);
  const runtime = {
    backend: 'docker',
    exec: (input: ExecInput) => exec(input),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue({ content: readContent, encoding: 'base64' }),
  } as unknown as RuntimeBackend;
  return { runtime, exec };
}

function createTool(runtime: RuntimeBackend) {
  return createAgentBrowser(runtime, 'ws-1', async () => ({ adapter, executablePath: adapter.chromiumExecutableCandidates[0] ?? null }));
}

describe('createAgentBrowser screenshot files', () => {
  it('reads screenshot files through runtime.readFile binary mode without python', async () => {
    const image = Buffer.from('fresh image').toString('base64');
    const { runtime, exec } = createRuntime([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"path":"/tmp/browser-pack/sero-agent-browser-shot.png"}', stderr: '', exitCode: 0 },
    ], image);

    const result = await createTool(runtime).execute('tc-shot', { action: 'screenshot' }, undefined, undefined, undefined as never);

    expect(runtime.readFile).toHaveBeenCalledWith({ path: '/tmp/browser-pack/sero-agent-browser-shot.png', binary: true });
    expect(exec.mock.calls.some(([input]) => String(input.command).includes('python3 -c'))).toBe(false);
    expect(result.content).toContainEqual({ type: 'image', data: image, mimeType: 'image/png' });
  });

  it('creates the screenshot temp directory and removes stale files before capture', async () => {
    const { runtime, exec } = createRuntime([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"path":"/tmp/browser-pack/sero-agent-browser-shot.png"}', stderr: '', exitCode: 0 },
    ]);

    await createTool(runtime).execute('tc-shot-lifecycle', { action: 'screenshot' }, undefined, undefined, undefined as never);

    expect(runtime.createDirectory).toHaveBeenCalledWith({ path: '/tmp/browser-pack', recursive: true });
    expect(runtime.delete).toHaveBeenCalledWith({ path: '/tmp/browser-pack/sero-agent-browser-shot.png' });
    expect(exec.mock.calls[1][0].command).toContain("'screenshot' '/tmp/browser-pack/sero-agent-browser-shot.png'");
  });

  it('does not read a stale image when screenshot capture fails', async () => {
    const { runtime } = createRuntime([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"error":"capture failed"}', stderr: '', exitCode: 1 },
    ], Buffer.from('stale image').toString('base64'));

    await expect(createTool(runtime).execute('tc-shot-fails', { action: 'screenshot' }, undefined, undefined, undefined as never)).rejects.toThrow('capture failed');

    expect(runtime.delete).toHaveBeenCalledWith({ path: '/tmp/browser-pack/sero-agent-browser-shot.png' });
    expect(runtime.readFile).not.toHaveBeenCalled();
  });

  it('uses base64 screenshot responses without reading a file', async () => {
    const image = Buffer.from('inline image data long enough to look like base64 content').toString('base64');
    const { runtime } = createRuntime([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: JSON.stringify({ screenshot: image }), stderr: '', exitCode: 0 },
    ]);

    const result = await createTool(runtime).execute('tc-inline-shot', { action: 'screenshot' }, undefined, undefined, undefined as never);

    expect(runtime.readFile).not.toHaveBeenCalled();
    expect(result.content).toContainEqual({ type: 'image', data: image, mimeType: 'image/png' });
  });
});
