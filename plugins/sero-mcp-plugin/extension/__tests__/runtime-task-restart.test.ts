import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTaskFixture } from './helpers/task-fixture';

let fixture: Awaited<ReturnType<typeof startTaskFixture>>;
let cwd = '';

beforeAll(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), 'mcp-task-restart-'));
  process.env.SERO_HOME = cwd;
  process.env.PI_CODING_AGENT_DIR = cwd;
  fixture = await startTaskFixture();
});

afterAll(() => {
  fixture.stop();
});

describe('MCP tasks across a runtime restart', () => {
  it('resumes a stored task in a new runtime and delivers the outcome to the chat', async () => {
    const { createMcpRuntime } = await import('../runtime/mcp-runtime');
    const first = createMcpRuntime();
    first.registerSession('chat-1', vi.fn());
    await first.handleSessionStart({ cwd });
    await first.executeManagerAction('save_raw_config', {
      cwd,
      rawConfig: JSON.stringify({ mcpServers: { reports: { transport: 'http', url: fixture.url } } }),
    });

    const started = await first.executeProxyAction('call_tool', {
      cwd,
      serverName: 'reports',
      toolName: 'run_report',
      toolArguments: { region: 'APAC', delayMs: 1_500 },
      sessionId: 'chat-1',
    });
    const taskId = String(started.details.taskId);
    expect(started.content[0]?.text).toContain(`runs as task ${taskId}`);
    await first.handleSessionShutdown();

    const second = createMcpRuntime();
    const send = vi.fn();
    second.registerSession('chat-1', send);
    await second.handleSessionStart({ cwd });

    await expect.poll(() => send.mock.calls.length, { timeout: 10_000 }).toBe(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ customType: 'mcp-task-result', content: expect.stringContaining('report ready: APAC') });
    expect((await second.executeProxyAction('task_status', { taskId })).content[0]?.text).toContain('completed');
    await second.handleSessionShutdown();
    // The task, the poll floor and two connects take about 5 s, which is the default test timeout.
  }, 20_000);
});
