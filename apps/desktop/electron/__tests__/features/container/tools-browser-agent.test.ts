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

  it('auto-installs agent-browser when the CLI is missing', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '', stderr: '', exitCode: 1 },
      { stdout: 'installed\n', stderr: '', exitCode: 0 },
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"message":"opened"}', stderr: '', exitCode: 0 },
    ]);

    await tool.execute('tc-install', { action: 'launch' }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[1][1]).toContain('npm install -g agent-browser');
    expect(exec.mock.calls[3][1]).toContain("'open' 'about:blank'");
  });

  it('maps start_recording to agent-browser record start', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
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
    expect(exec.mock.calls[1][1]).toContain("'record' 'start'");
  });

  it('supports launch without a url by opening about:blank', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"message":"Browser launched","url":"about:blank"}', stderr: '', exitCode: 0 },
    ]);

    const result = await tool.execute('tc-launch', { action: 'launch' }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[1][1]).toContain("'open' 'about:blank'");
    expect((result.content[0] as { type: string; text: string }).text).toContain('about:blank');
  });

  it('returns snapshot text from nested data payloads', async () => {
    const { tool } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      {
        stdout: '{"success":true,"data":{"snapshot":"- button \"Submit\" [ref=e1]"}}',
        stderr: '',
        exitCode: 0,
      },
    ]);

    const result = await tool.execute('tc-snapshot', { action: 'snapshot' }, undefined, undefined, undefined as never);

    expect((result.content[0] as { type: string; text: string }).text).toContain('[ref=e1]');
  });

  it('uses mouse commands for coordinate clicks', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"message":"moved"}', stderr: '', exitCode: 0 },
      { stdout: '{"message":"down"}', stderr: '', exitCode: 0 },
      { stdout: '{"message":"up"}', stderr: '', exitCode: 0 },
    ]);

    await tool.execute('tc-click', { action: 'click', x: 10, y: 20 }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[1][1]).toContain("'mouse' 'move' '10' '20'");
    expect(exec.mock.calls[2][1]).toContain("'mouse' 'down' 'left'");
    expect(exec.mock.calls[3][1]).toContain("'mouse' 'up' 'left'");
  });

  it('returns image blocks for screenshot path responses', async () => {
    const fakeB64 = Buffer.from('pngdata').toString('base64');
    const { tool } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"path":"/tmp/sero-agent-browser-shot.png"}', stderr: '', exitCode: 0 },
      { stdout: fakeB64, stderr: '', exitCode: 0 },
    ]);

    const result = await tool.execute('tc-2', { action: 'screenshot' }, undefined, undefined, undefined as never);

    expect(result.content).toContainEqual({
      type: 'image',
      data: fakeB64,
      mimeType: 'image/png',
    });
    expect(result.content).toContainEqual({
      type: 'text',
      text: 'Screenshot captured.',
    });
  });

  it('uses the schema default wait timeout for selector waits', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"message":"ready"}', stderr: '', exitCode: 0 },
    ]);

    await tool.execute('tc-3', { action: 'wait', selector: '#ready' }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[1][1]).toContain("AGENT_BROWSER_DEFAULT_TIMEOUT='10000'");
    expect(exec.mock.calls[1][1]).toContain("'wait' '#ready'");
  });

  it('uses native wait command for timeout waits', async () => {
    const { tool, exec } = await createToolWithExec([
      { stdout: '/usr/bin/agent-browser\n', stderr: '', exitCode: 0 },
      { stdout: '{"message":"waited"}', stderr: '', exitCode: 0 },
    ]);

    await tool.execute('tc-4', { action: 'wait', timeout: 750 }, undefined, undefined, undefined as never);

    expect(exec.mock.calls[1][1]).toContain("'wait' '750'");
  });
});
