import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import outputOptimizerExtension from '../index';

type Handler = (event: unknown, ctx: ExtensionContext) => Promise<unknown> | unknown;

interface ToolLike {
  name: string;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<unknown>;
}

interface Harness {
  pi: ExtensionAPI;
  handlers: Map<string, Handler>;
  tools: Map<string, ToolLike>;
  exec: ReturnType<typeof vi.fn>;
}

function harness(): Harness {
  const handlers = new Map<string, Handler>();
  const tools = new Map<string, ToolLike>();
  const resolution = {
    state: 'available',
    version: '0.49.0',
    host: { executablePath: '/host/bin/rtk', env: {} },
    runtime: { executablePath: '/runtime/bin/rtk', env: { RTK_DB_PATH: '/state/history.db' } },
  };
  const exec = vi.fn(async () => ({ stdout: 'rtk git status', stderr: '', code: 0, killed: false }));
  const pi = {
    on: (event: string, handler: Handler) => { handlers.set(event, handler); },
    registerTool: (tool: ToolLike) => { tools.set(tool.name, tool); },
    events: {
      emit: (_channel: string, data: unknown) => {
        const request = data as { accept(): void; resolve(result: unknown): void };
        request.accept();
        request.resolve(resolution);
      },
      on: () => () => undefined,
    },
    exec,
  } as unknown as ExtensionAPI;
  return { pi, handlers, tools, exec };
}

function context(): ExtensionContext {
  return {
    cwd: '/workspace',
    sessionManager: { getSessionId: () => 'session-1', getEntries: () => [] },
  } as unknown as ExtensionContext;
}

describe('output optimizer extension', () => {
  const originalHome = process.env.SERO_HOME;
  let directory: string;

  beforeEach(async () => {
    directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'output-optimizer-ext-'));
    process.env.SERO_HOME = directory;
  });

  afterEach(async () => {
    await fs.promises.rm(directory, { recursive: true, force: true });
    if (originalHome === undefined) delete process.env.SERO_HOME;
    else process.env.SERO_HOME = originalHome;
  });

  async function start(): Promise<{ harness: Harness; ctx: ExtensionContext }> {
    const h = harness();
    outputOptimizerExtension(h.pi);
    const ctx = context();
    await h.handlers.get('session_start')?.({}, ctx);
    return { harness: h, ctx };
  }

  it('runs commands as written and leaves results unmodified while disabled', async () => {
    const { harness: h, ctx } = await start();

    const event = { toolName: 'bash', toolCallId: 'call-1', input: { command: 'git status' } };
    await h.handlers.get('tool_call')?.(event, ctx);
    expect(event.input.command).toBe('git status');
    expect(h.exec).not.toHaveBeenCalled();

    const result = await h.handlers.get('tool_result')?.(
      { toolName: 'bash', toolCallId: 'call-1', input: { command: 'git status' }, content: [{ type: 'text', text: 'payload' }], details: {} },
      ctx,
    );
    expect(result).toBeUndefined();
  });

  it('applies an enabled toggle without a restart and disables again', async () => {
    const { harness: h, ctx } = await start();
    const tool = h.tools.get('output_optimizer');
    expect(tool).toBeDefined();

    await tool?.execute('id', { action: 'set', enabled: true });
    const rewritten = { toolName: 'bash', toolCallId: 'call-2', input: { command: 'git status' } };
    await h.handlers.get('tool_call')?.(rewritten, ctx);
    expect(rewritten.input.command).toContain('/runtime/bin/rtk');

    await tool?.execute('id', { action: 'set', enabled: false });
    const plain = { toolName: 'bash', toolCallId: 'call-3', input: { command: 'git status' } };
    await h.handlers.get('tool_call')?.(plain, ctx);
    expect(plain.input.command).toBe('git status');
  });

  it('skips nested run_code calls but keeps ordinary calls eligible', async () => {
    const { harness: h, ctx } = await start();
    await h.tools.get('output_optimizer')?.execute('id', { action: 'set', enabled: true });

    const nested = { toolName: 'bash', toolCallId: 'run_code_abc', input: { command: 'git status' } };
    await h.handlers.get('tool_call')?.(nested, ctx);
    expect(nested.input.command).toBe('git status');
    expect(h.exec).not.toHaveBeenCalled();

    const ordinary = { toolName: 'bash', toolCallId: 'call-9', input: { command: 'git status' } };
    await h.handlers.get('tool_call')?.(ordinary, ctx);
    expect(ordinary.input.command).toContain('/runtime/bin/rtk');
  });
});
