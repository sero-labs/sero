import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sessionInstances: Array<{
  promptCalls: Array<{ text: string }>;
  setModelCalls: any[];
  disposed: boolean;
  aborted: boolean;
  messages: any[];
}> = [];

function createMockSession(opts?: {
  promptDelay?: number;
  promptError?: Error;
  messages?: any[];
  availableModels?: any[];
}) {
  const availableModels = opts?.availableModels ?? [
    { provider: 'anthropic', id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { provider: 'openai', id: 'gpt-4o', name: 'GPT-4o' },
  ];
  const instance = {
    promptCalls: [] as Array<{ text: string }>,
    setModelCalls: [] as any[],
    disposed: false,
    aborted: false,
    messages: opts?.messages ?? [
      { role: 'user', content: [{ type: 'text', text: 'test' }] },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Mock output from agent' }],
      },
    ],
    prompt: vi.fn(async (text: string) => {
      instance.promptCalls.push({ text });
      if (opts?.promptDelay) {
        await new Promise((r) => setTimeout(r, opts.promptDelay));
      }
      if (opts?.promptError) throw opts.promptError;
    }),
    modelRuntime: {
      getAvailable: vi.fn(async () => availableModels),
      getModel: vi.fn((provider: string, modelId: string) =>
        availableModels.find((model) => model.provider === provider && model.id === modelId),
      ),
    },
    setModel: vi.fn(async (model: any) => {
      instance.setModelCalls.push(model);
    }),
    abort: vi.fn(() => {
      instance.aborted = true;
    }),
    dispose: vi.fn(() => {
      instance.disposed = true;
    }),
  };
  sessionInstances.push(instance);
  return instance;
}

vi.mock('@earendil-works/pi-coding-agent', () => ({
  createAgentSession: vi.fn(async () => {
    const session = createMockSession();
    return { session, extensionsResult: { extensions: [], errors: [], runtime: {} } };
  }),
  SessionManager: {
    inMemory: vi.fn((cwd?: string) => ({ type: 'inMemory', cwd })),
  },
}));

vi.mock('../logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { createAgentSession } from '@earendil-works/pi-coding-agent';
import {
  runTransientSession,
  setMaxConcurrent,
  getMaxConcurrent,
  getActiveCount,
  getActiveNames,
} from '../session-runner';

beforeEach(() => {
  sessionInstances.length = 0;
  setMaxConcurrent(2);
  vi.mocked(createAgentSession).mockReset();
  vi.mocked(createAgentSession).mockImplementation(async () => {
    const session = createMockSession();
    return {
      session: session as any,
      extensionsResult: { extensions: [], errors: [], runtime: {} as any },
    };
  });
});

afterEach(() => {
  delete process.env.SERO_CRON_SUBPROCESS;
});

describe('runTransientSession', () => {
  it('creates an in-memory session, runs prompt, and disposes', async () => {
    const result = await runTransientSession('test-job', 'Hello agent');

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('Mock output from agent');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();

    expect(sessionInstances).toHaveLength(1);
    expect(sessionInstances[0].promptCalls).toHaveLength(1);
    expect(sessionInstances[0].promptCalls[0].text).toBe('Hello agent');
    expect(sessionInstances[0].disposed).toBe(true);
  });

  it('passes cwd and agentDir to createAgentSession', async () => {
    await runTransientSession('job-1', 'Do work', {
      cwd: '/test/workspace',
      agentDir: '/test/agent-dir',
    });

    expect(createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/test/workspace',
        agentDir: '/test/agent-dir',
      }),
    );
  });

  it('uses Pi built-in coding tools by name', async () => {
    await runTransientSession('tool-job', 'Do work', {
      cwd: '/test/workspace',
    });

    expect(createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: ['read', 'bash', 'edit', 'write'],
      }),
    );
  });

  it('applies model override after creating the session', async () => {
    await runTransientSession('model-job', 'Do work', {
      model: 'sonnet',
      cwd: '/test/workspace',
    });

    expect(createAgentSession).toHaveBeenCalledWith(
      expect.not.objectContaining({ model: expect.anything() }),
    );
    expect(sessionInstances[0].setModelCalls).toEqual([
      expect.objectContaining({ provider: 'anthropic', id: 'claude-sonnet-4-6' }),
    ]);
  });

  it('omits model override when not specified', async () => {
    await runTransientSession('no-model-job', 'Do work', {
      cwd: '/test/workspace',
    });

    expect(createAgentSession).toHaveBeenCalledWith(
      expect.not.objectContaining({ model: expect.anything() }),
    );
    expect(sessionInstances[0].setModelCalls).toEqual([]);
  });

  it('uses SessionManager.inMemory() — no files persisted', async () => {
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    await runTransientSession('job-1', 'test');

    expect(SessionManager.inMemory).toHaveBeenCalled();
    expect(createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionManager: expect.objectContaining({ type: 'inMemory' }),
      }),
    );
  });

  it('disposes session even on prompt error', async () => {
    vi.mocked(createAgentSession).mockImplementationOnce(async () => {
      const session = createMockSession({ promptError: new Error('LLM failed') });
      return {
        session: session as any,
        extensionsResult: { extensions: [], errors: [], runtime: {} as any },
      };
    });

    const result = await runTransientSession('fail-job', 'break');

    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('LLM failed');
    expect(sessionInstances[0].disposed).toBe(true);
  });

  it('disposes session even on createAgentSession failure', async () => {
    vi.mocked(createAgentSession).mockRejectedValueOnce(
      new Error('Auth missing'),
    );

    const result = await runTransientSession('no-auth', 'test');

    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('Auth missing');
    // No session was created, so nothing to dispose
    expect(sessionInstances).toHaveLength(0);
  });
});

describe('re-entrancy guard', () => {
  it('sets SERO_CRON_SUBPROCESS=1 during session creation', async () => {
    let envDuringCreate: string | undefined;

    vi.mocked(createAgentSession).mockImplementationOnce(async () => {
      envDuringCreate = process.env.SERO_CRON_SUBPROCESS;
      const session = createMockSession();
      return {
        session: session as any,
        extensionsResult: { extensions: [], errors: [], runtime: {} as any },
      };
    });

    await runTransientSession('guard-test', 'test');

    expect(envDuringCreate).toBe('1');
  });

  it('restores original SERO_CRON_SUBPROCESS after session creation', async () => {
    delete process.env.SERO_CRON_SUBPROCESS;

    await runTransientSession('restore-test', 'test');

    expect(process.env.SERO_CRON_SUBPROCESS).toBeUndefined();
  });

  it('preserves existing SERO_CRON_SUBPROCESS value', async () => {
    process.env.SERO_CRON_SUBPROCESS = 'already-set';

    await runTransientSession('preserve-test', 'test');

    expect(process.env.SERO_CRON_SUBPROCESS).toBe('already-set');
  });

  it('restores env even if createAgentSession throws', async () => {
    delete process.env.SERO_CRON_SUBPROCESS;
    vi.mocked(createAgentSession).mockRejectedValueOnce(new Error('boom'));

    await runTransientSession('crash-guard', 'test');

    expect(process.env.SERO_CRON_SUBPROCESS).toBeUndefined();
  });
});

describe('concurrency control', () => {
  it('rejects duplicate job keys', async () => {
    // Start a slow job
    vi.mocked(createAgentSession).mockImplementation(async () => {
      const session = createMockSession({ promptDelay: 200 });
      return {
        session: session as any,
        extensionsResult: { extensions: [], errors: [], runtime: {} as any },
      };
    });

    const first = runTransientSession('dupe-job', 'first');
    // Give it a tick to acquire the slot
    await new Promise((r) => setTimeout(r, 10));

    const second = await runTransientSession('dupe-job', 'second');

    expect(second.exitCode).toBe(1);
    expect(second.error).toContain('already running');

    await first; // Clean up
  });

  it('enforces max concurrent sessions', async () => {
    setMaxConcurrent(2);
    const completionOrder: string[] = [];

    vi.mocked(createAgentSession).mockImplementation(async () => {
      const session = createMockSession({ promptDelay: 100 });
      return {
        session: session as any,
        extensionsResult: { extensions: [], errors: [], runtime: {} as any },
      };
    });

    const job1 = runTransientSession('job-a', 'a').then((r) => {
      completionOrder.push('a');
      return r;
    });
    const job2 = runTransientSession('job-b', 'b').then((r) => {
      completionOrder.push('b');
      return r;
    });

    // Give slots time to be acquired
    await new Promise((r) => setTimeout(r, 10));
    expect(getActiveCount()).toBe(2);

    // Third job should queue
    const job3 = runTransientSession('job-c', 'c').then((r) => {
      completionOrder.push('c');
      return r;
    });

    // Wait for all to complete
    const [r1, r2, r3] = await Promise.all([job1, job2, job3]);

    expect(r1.exitCode).toBe(0);
    expect(r2.exitCode).toBe(0);
    expect(r3.exitCode).toBe(0);

    // job-c should have started after one of the first two finished
    expect(completionOrder[2]).toBe('c');
  });

  it('releases slot after job completes', async () => {
    setMaxConcurrent(1);

    await runTransientSession('seq-1', 'first');
    expect(getActiveCount()).toBe(0);

    await runTransientSession('seq-2', 'second');
    expect(getActiveCount()).toBe(0);

    expect(sessionInstances).toHaveLength(2);
    expect(sessionInstances.every((s) => s.disposed)).toBe(true);
  });

  it('releases slot after job failure', async () => {
    setMaxConcurrent(1);

    vi.mocked(createAgentSession).mockRejectedValueOnce(
      new Error('fail'),
    );

    await runTransientSession('fail-slot', 'test');
    expect(getActiveCount()).toBe(0);

    // Next job should proceed fine
    vi.mocked(createAgentSession).mockImplementationOnce(async () => {
      const session = createMockSession();
      return {
        session: session as any,
        extensionsResult: { extensions: [], errors: [], runtime: {} as any },
      };
    });
    const result = await runTransientSession('after-fail', 'test');
    expect(result.exitCode).toBe(0);
    expect(getActiveCount()).toBe(0);
  });

  it('getActiveNames returns running job keys', async () => {
    vi.mocked(createAgentSession).mockImplementation(async () => {
      const session = createMockSession({ promptDelay: 200 });
      return {
        session: session as any,
        extensionsResult: { extensions: [], errors: [], runtime: {} as any },
      };
    });

    const p1 = runTransientSession('running-a', 'test');
    const p2 = runTransientSession('running-b', 'test');
    await new Promise((r) => setTimeout(r, 10));

    const names = getActiveNames();
    expect(names).toContain('running-a');
    expect(names).toContain('running-b');

    await Promise.all([p1, p2]);
  });

  it('setMaxConcurrent clamps to minimum of 1', () => {
    setMaxConcurrent(0);
    expect(getMaxConcurrent()).toBe(1);
    setMaxConcurrent(-5);
    expect(getMaxConcurrent()).toBe(1);
  });
});

describe('timeout', () => {
  it('aborts session when timeout expires', async () => {
    vi.mocked(createAgentSession).mockImplementationOnce(async () => {
      const session = createMockSession({ promptDelay: 5000 });
      return {
        session: session as any,
        extensionsResult: { extensions: [], errors: [], runtime: {} as any },
      };
    });

    const result = await runTransientSession('timeout-job', 'slow', {
      timeoutMs: 50,
    });

    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('timed out');

    // Session should be both aborted and disposed
    expect(sessionInstances[0].aborted).toBe(true);
    expect(sessionInstances[0].disposed).toBe(true);
  });
});

describe('output extraction', () => {
  it('extracts text from last assistant message', async () => {
    vi.mocked(createAgentSession).mockImplementationOnce(async () => {
      const session = createMockSession({
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'hello' }] },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'First part. ' },
              { type: 'text', text: 'Second part.' },
            ],
          },
        ],
      });
      return {
        session: session as any,
        extensionsResult: { extensions: [], errors: [], runtime: {} as any },
      };
    });

    const result = await runTransientSession('multi-text', 'test');
    expect(result.output).toBe('First part. \nSecond part.');
  });

  it('returns empty string when no assistant message', async () => {
    vi.mocked(createAgentSession).mockImplementationOnce(async () => {
      const session = createMockSession({
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'hello' }] },
        ],
      });
      return {
        session: session as any,
        extensionsResult: { extensions: [], errors: [], runtime: {} as any },
      };
    });

    const result = await runTransientSession('no-reply', 'test');
    expect(result.output).toBe('');
  });

  it('skips non-text content blocks', async () => {
    vi.mocked(createAgentSession).mockImplementationOnce(async () => {
      const session = createMockSession({
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'internal thoughts' },
              { type: 'text', text: 'Visible output' },
            ],
          },
        ],
      });
      return {
        session: session as any,
        extensionsResult: { extensions: [], errors: [], runtime: {} as any },
      };
    });

    const result = await runTransientSession('mixed-content', 'test');
    expect(result.output).toBe('Visible output');
  });

  it('uses the LAST assistant message', async () => {
    vi.mocked(createAgentSession).mockImplementationOnce(async () => {
      const session = createMockSession({
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Early response' }],
          },
          { role: 'user', content: [{ type: 'text', text: 'followup' }] },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Final response' }],
          },
        ],
      });
      return {
        session: session as any,
        extensionsResult: { extensions: [], errors: [], runtime: {} as any },
      };
    });

    const result = await runTransientSession('multi-turn', 'test');
    expect(result.output).toBe('Final response');
  });
});
