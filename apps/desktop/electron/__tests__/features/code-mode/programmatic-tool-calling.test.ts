import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { Type, type TSchema } from 'typebox';
import { Value } from 'typebox/value';
import { describe, expect, it, vi } from 'vitest';

import {
  executeProgram,
  ProgramExecutionError,
  PROGRAM_LIMITS,
} from '@electron/features/code-mode/program-runner';
import {
  normalizeToolResult,
  RUN_CODE_TOOL_NAME,
  snapshotActiveTools,
} from '@electron/features/code-mode/tool-adapter';
import {
  createRunCodeController,
  type RunCodeAgent,
  type RunCodeController,
} from '@electron/features/code-mode';

type ToolHandler = (input: unknown, signal?: AbortSignal) => Promise<AgentToolResult<unknown>>;

function createTool(name: string, parameters: TSchema, handler: ToolHandler): AgentTool {
  return {
    name,
    label: name,
    description: `${name} test tool`,
    parameters,
    execute: async (_toolCallId, input, signal) => handler(input, signal),
  };
}

function toolMap(...tools: AgentTool[]): Map<string, AgentTool> {
  return snapshotActiveTools(tools);
}

function runCodeMessage(): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'toolCall', id: 'run-code-test', name: RUN_CODE_TOOL_NAME, arguments: {} }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'test',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'toolUse',
    timestamp: 0,
  };
}

function runCodeAgent(
  tools: readonly AgentTool[],
  hooks: Pick<RunCodeAgent, 'beforeToolCall' | 'afterToolCall'> = {},
): RunCodeAgent {
  return {
    state: { systemPrompt: 'test', messages: [runCodeMessage()], tools },
    ...hooks,
  };
}

async function invokeRunCode(controller: RunCodeController, code: string): Promise<AgentToolResult<unknown>> {
  return Reflect.apply(controller.tool.execute, controller.tool, [
    'run-code-test',
    { code },
    undefined,
    undefined,
    undefined,
  ]);
}

describe('program runner', () => {
  it('runs standard JavaScript in an isolated environment', async () => {
    const result = await executeProgram(`
      const input = [{ name: 'b', score: 1 }, { name: 'a', score: 3 }];
      return {
        names: input.filter((item) => item.score > 1).map((item) => item.name).sort(),
        host: {
          process: typeof process,
          require: typeof require,
          fetch: typeof fetch,
        },
      };
    `, new Map());

    expect(result.value).toEqual({
      names: ['a'],
      host: { process: 'undefined', require: 'undefined', fetch: 'undefined' },
    });
  });

  it('strips TypeScript before execution', async () => {
    const result = await executeProgram(`
      const values: number[] = [1, 2, 3];
      return values.reduce((sum: number, value: number) => sum + value, 0);
    `, new Map());

    expect(result.value).toBe(6);
  });

  it('returns a clear source-limit failure without retrying', async () => {
    const source = `return '${'x'.repeat(PROGRAM_LIMITS.maxSourceBytes)}';`;

    await expect(executeProgram(source, new Map())).rejects.toMatchObject({
      name: 'ProgramExecutionError',
    });
  });

  it('reports the guest-code location for syntax failures', async () => {
    await expect(executeProgram('const value = { total: 1 }}; return value;', new Map()))
      .rejects.toThrow(/Unexpected token.*at run\.js:1:\d+/s);
  });
});

describe('nested tool adapter', () => {
  it('excludes run_code and exposes only the supplied active tools', () => {
    const read = createTool('read', Type.Object({ path: Type.String() }), async () => ({
      content: [{ type: 'text', text: 'ok' }],
      details: undefined,
    }));
    const recursive = createTool(RUN_CODE_TOOL_NAME, Type.Object({}), async () => ({
      content: [{ type: 'text', text: 'no' }],
      details: undefined,
    }));

    const snapshot = snapshotActiveTools([read, recursive]);

    expect([...snapshot.keys()]).toEqual(['read']);
    expect(snapshot.has('write')).toBe(false);
  });

  it('rejects invalid arguments before invoking a tool', async () => {
    const handler = vi.fn<ToolHandler>(async () => ({
      content: [{ type: 'text', text: 'called' }],
      details: undefined,
    }));
    const echo = createTool('echo', Type.Object({ value: Type.String() }), handler);

    await expect(executeProgram(
      'return await tools.echo({});',
      toolMap(echo),
    )).rejects.toBeInstanceOf(ProgramExecutionError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('runs tools concurrently and gives code direct text results', async () => {
    const readParams = Type.Object({ path: Type.String() });
    const read = createTool('read', readParams, async (input) => {
      const { path } = Value.Decode(readParams, input);
      return {
        content: [{ type: 'text', text: JSON.stringify({ path }) }],
        details: { path },
      };
    });

    const result = await executeProgram(`
      const files = await Promise.all([
        tools.read({ path: 'b.json' }),
        tools.read({ path: 'a.json' }),
      ]);
      return files.map((file) => JSON.parse(file.text).path).sort();
    `, toolMap(read));

    expect(result.value).toEqual(['a.json', 'b.json']);
    expect(result.trace.calls).toHaveLength(2);
    expect(result.trace.calls.every((call) => call.status === 'completed')).toBe(true);
  });

  it('supports active tool names that are not JavaScript identifiers', async () => {
    const cliParams = Type.Object({ command: Type.String() });
    const cli = createTool('sero-cli', cliParams, async (input) => {
      const { command } = Value.Decode(cliParams, input);
      return {
        content: [{ type: 'text', text: `ran ${command}` }],
        details: undefined,
      };
    });
    const tools = toolMap(cli);

    await expect(executeProgram("return 'ready';", tools)).resolves.toMatchObject({ value: 'ready' });
    const result = await executeProgram(`
      return await tools.call({ name: 'sero-cli', args: { command: 'workspace list' } });
    `, tools);

    expect(result.value).toEqual({ text: 'ran workspace list' });
    expect(result.trace.calls).toEqual([
      expect.objectContaining({ tool: 'sero-cli', status: 'completed' }),
    ]);
  });

  it('passes cancellation to an active nested call', async () => {
    const wait = createTool('wait', Type.Object({}), async (_input, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
      if (signal?.aborted) reject(new Error('cancelled'));
    }));
    const controller = new AbortController();
    const pending = executeProgram('return await tools.wait({});', toolMap(wait), controller.signal);

    setTimeout(() => controller.abort(), 10);

    await expect(pending).rejects.toMatchObject({ name: 'ProgramExecutionError' });
  });

  it('collapses trace entries after the fixed detail limit', async () => {
    const ping = createTool('ping', Type.Object({}), async () => ({
      content: [{ type: 'text', text: 'pong' }],
      details: undefined,
    }));

    const result = await executeProgram(`
      for (let index = 0; index < 55; index += 1) await tools.ping({});
      return 'done';
    `, toolMap(ping));

    expect(result.trace.calls).toHaveLength(50);
    expect(result.trace.omitted).toEqual([{ tool: 'ping', status: 'completed', count: 5 }]);
  });

  it('normalizes text, images, and cloneable details', () => {
    expect(normalizeToolResult({
      content: [
        { type: 'text', text: 'first' },
        { type: 'text', text: 'second' },
        { type: 'image', data: 'abc', mimeType: 'image/png' },
      ],
      details: { page: 2 },
    })).toEqual({
      text: 'first\nsecond',
      images: [{ data: 'abc', mimeType: 'image/png' }],
      details: { page: 2 },
    });
  });
});

describe('run_code tool', () => {
  it('combines two session tools into one compact result', async () => {
    const read = createTool('read', Type.Object({ path: Type.String() }), async () => ({
      content: [{ type: 'text', text: '{"scores":[1,4,2]}' }],
      details: undefined,
    }));
    const settings = createTool('plugin_settings', Type.Object({}), async () => ({
      content: [{ type: 'text', text: '{"minimum":3}' }],
      details: undefined,
    }));
    const controller = createRunCodeController();
    controller.bind(runCodeAgent([read, settings]));

    const result = await invokeRunCode(controller, `
      const [file, settings] = await Promise.all([
        tools.read({ path: 'scores.json' }),
        tools.plugin_settings({}),
      ]);
      const scores = JSON.parse(file.text).scores;
      const minimum = JSON.parse(settings.text).minimum;
      return scores.filter((score) => score >= minimum);
    `);

    expect(result.details).toMatchObject({
      value: [4],
      calls: { calls: expect.arrayContaining([
        expect.objectContaining({ tool: 'read' }),
        expect.objectContaining({ tool: 'plugin_settings' }),
      ]) },
    });
    expect(result.content).toEqual([{
      type: 'text',
      text: '[ 4 ]\n\nNested calls: 2 completed, 0 failed',
    }]);
  });

  it('uses the tools supplied by its active-session binding', async () => {
    const plugin = createTool('plugin_lookup', Type.Object({}), async () => ({
      content: [{ type: 'text', text: '{"items":[3,1,2]}' }],
      details: undefined,
    }));
    const controller = createRunCodeController();
    controller.bind(runCodeAgent([plugin]));

    const result = await invokeRunCode(controller, `
      const response = await tools.plugin_lookup({});
      return JSON.parse(response.text).items.sort();
    `);

    expect(result.details).toMatchObject({ value: [1, 2, 3] });
    expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('1') });
  });

  it('takes a fresh active-tool snapshot for each program', async () => {
    const plugin = createTool('plugin_lookup', Type.Object({}), async () => ({
      content: [{ type: 'text', text: 'available' }],
      details: undefined,
    }));
    const activeTools: AgentTool[] = [plugin];
    const agent = runCodeAgent(activeTools);
    const controller = createRunCodeController();
    controller.bind(agent);

    await expect(invokeRunCode(controller, 'return await tools.plugin_lookup({});')).resolves.toBeDefined();
    activeTools.splice(0);
    await expect(invokeRunCode(controller, 'return await tools.plugin_lookup({});'))
      .rejects.toThrow(/Unknown host function: tools\.plugin_lookup/);
  });

  it('honors beforeToolCall blocks without invoking the nested tool', async () => {
    const handler = vi.fn<ToolHandler>(async () => ({
      content: [{ type: 'text', text: 'unsafe' }],
      details: undefined,
    }));
    const bash = createTool('bash', Type.Object({ command: Type.String() }), handler);
    const beforeToolCall = vi.fn<NonNullable<RunCodeAgent['beforeToolCall']>>(async ({ toolCall }) => {
      expect(toolCall.name).toBe('bash');
      return { block: true, reason: 'Approval required' };
    });
    const controller = createRunCodeController();
    controller.bind(runCodeAgent([bash], { beforeToolCall }));

    await expect(invokeRunCode(controller, "return await tools.bash({ command: 'sudo rm -rf /' });"))
      .rejects.toThrow(/Code execution failed/);
    expect(beforeToolCall).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it('applies beforeToolCall mutations and afterToolCall result hooks', async () => {
    const echoParams = Type.Object({ value: Type.String() });
    const handler = vi.fn<ToolHandler>(async (input) => {
      const { value } = Value.Decode(echoParams, input);
      return { content: [{ type: 'text', text: value }], details: { source: 'handler' } };
    });
    const echo = createTool('echo', echoParams, handler);
    const beforeToolCall = vi.fn<NonNullable<RunCodeAgent['beforeToolCall']>>(async ({ args }) => {
      Value.Assert(echoParams, args);
      args.value = 'updated by hook';
      return undefined;
    });
    const afterToolCall = vi.fn<NonNullable<RunCodeAgent['afterToolCall']>>(async ({ result }) => ({
      content: [{ type: 'text', text: `${result.content[0]?.type === 'text' ? result.content[0].text : ''} and finalized` }],
      details: { source: 'hook' },
    }));
    const controller = createRunCodeController();
    controller.bind(runCodeAgent([echo], { beforeToolCall, afterToolCall }));

    const result = await invokeRunCode(controller, "return await tools.echo({ value: 'original' });");

    expect(handler.mock.calls[0]?.[0]).toEqual({ value: 'updated by hook' });
    expect(beforeToolCall).toHaveBeenCalledOnce();
    expect(afterToolCall).toHaveBeenCalledOnce();
    expect(result.details).toMatchObject({
      value: { text: 'updated by hook and finalized', details: { source: 'hook' } },
    });
  });

  it('reports nested tool and runtime failures through one tool failure', async () => {
    const fail = createTool('fail', Type.Object({}), async () => {
      throw new Error('fixture failed');
    });
    const controller = createRunCodeController();
    controller.bind(runCodeAgent([fail]));

    await expect(invokeRunCode(controller, 'return await tools.fail({});'))
      .rejects.toThrow(/Code execution failed:.*Nested calls: 0 completed, 1 failed/s);
  });
});
