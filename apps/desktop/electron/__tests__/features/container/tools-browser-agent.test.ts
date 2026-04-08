import { beforeEach, describe, expect, it, vi } from 'vitest';

type ExecResult = { stdout: string; stderr: string; exitCode: number };

function createExecMock(results: ExecResult[]) {
  const exec = vi.fn();
  for (const result of results) {
    exec.mockResolvedValueOnce(result);
  }
  return exec;
}

async function createToolWithExec(results: ExecResult[]) {
  vi.resetModules();
  const exec = createExecMock(results);
  const { createAgentBrowser } = await import('../../../features/container/tools/tools-browser-agent');
  const tool = createAgentBrowser({ exec } as never, 'ws-1');
  return { tool, exec };
}

describe('createAgentBrowser', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps start_recording to agent-browser record start', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"running":true}', stderr: '', exitCode: 0 },
      { stdout: '{"message":"recording"}', stderr: '', exitCode: 0 },
    ]);

    const result = await tool.execute(
      'tc-1',
      { action: 'start_recording', save_path: '/workspace/capture.webm' },
      undefined,
      undefined,
      undefined as never,
    );

    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect((result.content[0] as { type: string; text: string }).text).toContain('recording');
    expect(exec.mock.calls[2][1]).toContain("'record' 'start'");
  });

  it('returns image blocks for screenshot path responses', async () => {
    const fakeB64 = Buffer.from('pngdata').toString('base64');
    const { tool } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"running":true}', stderr: '', exitCode: 0 },
      { stdout: '{"path":"/tmp/sero-agent-browser-shot.png"}', stderr: '', exitCode: 0 },
      { stdout: fakeB64, stderr: '', exitCode: 0 },
    ]);

    const result = await tool.execute('tc-2', { action: 'screenshot' }, undefined, undefined, undefined as never);

    expect(result.content[0]).toEqual({
      type: 'image',
      data: fakeB64,
      mimeType: 'image/png',
    });
  });

  it('uses native wait command for timeout waits', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"running":true}', stderr: '', exitCode: 0 },
      { stdout: '{"message":"waited"}', stderr: '', exitCode: 0 },
    ]);

    await tool.execute('tc-3', { action: 'wait', timeout: 750 }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[2][1]).toContain("'wait' '750'");
  });
});
