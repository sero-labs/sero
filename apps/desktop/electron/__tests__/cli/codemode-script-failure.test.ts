/**
 * A Code Mode script that drives `sero-cli` through a real Pi session.
 *
 * The stub provider gives the model one script to run, so every nested call
 * goes through Pi's own pipeline and the real `sero-cli` tool.
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  type AgentSession,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installCliSessionBridge } from '@electron/cli/bridges/session-bridge';
import { CliRegistry } from '@electron/cli/core/registry';
import { bridgeTool } from '@electron/cli/core/schema-bridge';
import { createSeroCliTool } from '@electron/cli/core/tool';
import { activateCodemode, createSeroCodemodeExtension } from '@electron/features/codemode';
import { workspaceManager } from '@electron/shared/infra/shared-infra';
import {
  seedFixtureAgentDir,
  startProviderFixture,
} from '../agent/fixtures/provider-fixture';
import {
  FIXTURE_MODEL_ID,
  FIXTURE_PROVIDER_ID,
  type ProviderScenario,
} from '../agent/fixtures/provider-scenarios';

function scriptScenario(script: string): ProviderScenario {
  return {
    prompt: 'run the script',
    attempts: [
      {
        steps: [{ kind: 'tool_calls', calls: [{ id: 'call_codemode', toolName: 'codemode', argChunks: [JSON.stringify({ code: script })] }] }],
        end: { kind: 'finish', reason: 'tool_calls' },
      },
      { steps: [{ kind: 'text', chunks: ['done'] }], end: { kind: 'finish', reason: 'stop' } },
    ],
  };
}

function resultText(messages: AgentSession['messages']): string {
  const parts: string[] = [];
  for (const message of messages) {
    if (message.role !== 'toolResult' || message.toolCallId !== 'call_codemode') continue;
    for (const block of message.content) if (block.type === 'text') parts.push(block.text);
  }
  return parts.join('\n');
}

describe('a Code Mode script that calls sero-cli', () => {
  const cleanups: Array<() => Promise<void>> = [];
  let ran: string[];
  let budgetChecks: number;

  beforeEach(() => {
    ran = [];
    budgetChecks = 0;
    installCliSessionBridge({
      getSessionEntry: () => undefined,
      getActiveSessionForWorkspace: () => undefined,
      getActiveTurnId: () => 'turn-1',
      noteTurnStart: () => {},
      noteTurnEnd: () => {},
      // The real limit: 50 commands in one turn.
      consumeTurnBudget: () => ({ allowed: ++budgetChecks <= 50, count: budgetChecks, limit: 50 }),
      setSessionTitle: () => {},
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup().catch(() => undefined)));
  });

  async function runScript(script: string): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sero-codemode-cli-'));
    const workspace = path.join(root, 'workspace');
    const agentDir = path.join(root, 'agent');
    await mkdir(workspace, { recursive: true });
    vi.spyOn(workspaceManager, 'getPath').mockReturnValue(workspace);

    const registry = new CliRegistry();
    registry.register(bridgeTool('browser_click', {
      name: 'browser_click',
      label: 'Click',
      description: 'Click an element',
      parameters: Type.Object({ selector: Type.String() }),
      execute: async (_id, params: { selector: string }) => {
        ran.push(params.selector);
        if (params.selector === 'covered') throw new Error("Element 'covered' is covered by <div#shutter>");
        return { content: [{ type: 'text', text: 'Done.' }], details: {} };
      },
    }));

    const fixture = await startProviderFixture(scriptScenario(script));
    await seedFixtureAgentDir(agentDir, { baseUrl: fixture.url });
    const modelRuntime = await ModelRuntime.create({
      authPath: path.join(agentDir, 'auth.json'),
      modelsPath: path.join(agentDir, 'models.json'),
      refreshOnCreate: false,
    });
    const model = modelRuntime.getModel(FIXTURE_PROVIDER_ID, FIXTURE_MODEL_ID);
    if (!model) throw new Error('Fixture model is not registered');
    const loader = new DefaultResourceLoader({ cwd: workspace, agentDir, extensionFactories: [createSeroCodemodeExtension()] });
    await loader.reload();
    const { session } = await createAgentSession({
      cwd: workspace,
      agentDir,
      modelRuntime,
      model,
      tools: ['sero-cli', 'codemode'],
      customTools: [createSeroCliTool(registry, 'ws-1', 'session-1')],
      resourceLoader: loader,
    });
    activateCodemode(session);
    cleanups.push(async () => {
      session.dispose();
      await fixture.close();
      await rm(root, { recursive: true, force: true });
    });

    await session.prompt('run the script');
    return resultText(session.messages);
  }

  it('stops at the first failed command and never runs the lines after it', async () => {
    const result = await runScript([
      "const run = async (c) => (await tools.sero_cli({ command: c })).trim();",
      "await run('browser_click first');",
      "await run('browser_click covered');",
      "await run('browser_click after-the-failure');",
    ].join('\n'));

    expect(ran).toEqual(['first', 'covered']);
    expect(result).toContain('is covered by');
  });

  it('runs more than 50 commands in one script without a rate limit', async () => {
    const result = await runScript([
      "for (let i = 0; i < 60; i += 1) await tools.sero_cli({ command: 'browser_click cell' + i });",
      "text('all clicked');",
    ].join('\n'));

    expect(ran).toHaveLength(60);
    expect(result).not.toContain('Rate limit');
    expect(budgetChecks).toBe(0);
  });
});
