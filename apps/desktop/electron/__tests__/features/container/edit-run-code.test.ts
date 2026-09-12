import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHostCodingTools } from '@electron/features/container/tools/tools-host';
import {
  createRunCodeController,
  type RunCodeAgent,
  type RunCodeController,
} from '@electron/features/code-mode';
import { RUN_CODE_TOOL_NAME } from '@electron/features/code-mode/tool-adapter';

function toAgentTool(definition: ToolDefinition): AgentTool {
  return {
    name: definition.name,
    label: definition.label,
    description: definition.description,
    parameters: definition.parameters,
    execute: (toolCallId, input, signal) => definition.execute(
      toolCallId,
      input,
      signal,
      undefined,
      undefined as never,
    ),
  };
}

function runCodeMessage() {
  return {
    role: 'assistant' as const,
    content: [{ type: 'toolCall' as const, id: 'run-code-test', name: RUN_CODE_TOOL_NAME, arguments: {} }],
    api: 'anthropic-messages' as const,
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
    stopReason: 'toolUse' as const,
    timestamp: 0,
  };
}

function bindController(workspace: string): RunCodeController {
  const controller = createRunCodeController();
  const tools = createHostCodingTools(workspace).map(toAgentTool);
  const agent: RunCodeAgent = {
    state: { systemPrompt: 'test', messages: [runCodeMessage()], tools },
  };
  controller.bind(agent);
  return controller;
}

async function runProgram(controller: RunCodeController, code: string) {
  return Reflect.apply(controller.tool.execute, controller.tool, [
    'run-code-test',
    { code },
    undefined,
    undefined,
    undefined,
  ]) as Promise<{ content: Array<{ type: string; text?: string }> }>;
}

describe('run_code file mutations', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'sero-run-code-edit-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('retains both compatible edits issued without awaiting each one', async () => {
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(path.join(workspace, 'a.ts'), 'one\ntwo\n', 'utf8'));

    const controller = bindController(workspace);
    await runProgram(controller, `
      const first = tools.edit({ path: 'a.ts', oldText: 'one', newText: '1' });
      const second = tools.edit({ path: 'a.ts', oldText: 'two', newText: '2' });
      const results = await Promise.all([first, second]);
      return results.map((entry) => entry.text).join(' | ');
    `);

    expect(await readFile(path.join(workspace, 'a.ts'), 'utf8')).toBe('1\n2\n');
  });

  it('fails a conflicting edit inside a program without overwriting the first', async () => {
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(path.join(workspace, 'a.ts'), 'target\nkeep\n', 'utf8'));

    const controller = bindController(workspace);
    const result = await runProgram(controller, `
      const first = await tools.edit({ path: 'a.ts', oldText: 'target', newText: 'replaced' });
      let second;
      try {
        second = await tools.edit({ path: 'a.ts', oldText: 'target', newText: 'other' });
      } catch (error) {
        second = String(error && error.message ? error.message : error);
      }
      return first.text + ' || ' + second;
    `);

    expect(await readFile(path.join(workspace, 'a.ts'), 'utf8')).toBe('replaced\nkeep\n');
    expect(result.content[0]?.text).toContain('Nested calls: 1 completed, 1 failed');
  });
});
