/**
 * A Code Mode script that calls `subagent` or `create_agent` through a real
 * Pi session. A refused call must reject, so the script stops at it.
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
import { afterEach, describe, expect, it, vi } from 'vitest';

import { activateCodemode, createSeroCodemodeExtension } from '@electron/features/codemode';
import type { SubagentManager } from '@electron/features/subagent';
import { registerCreateAgentTool, registerSubagentTool } from '@electron/features/subagent/extensions/tool';
import { seedFixtureAgentDir, startProviderFixture } from '../../agent/fixtures/provider-fixture';
import { FIXTURE_MODEL_ID, FIXTURE_PROVIDER_ID, type ProviderScenario } from '../../agent/fixtures/provider-scenarios';

const AFTER = 'the line after the refused call ran';

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

describe('a Code Mode script that calls subagent or create_agent', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const runSingle = vi.fn();

  afterEach(async () => {
    runSingle.mockReset();
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup().catch(() => undefined)));
  });

  async function runScript(script: string, opened?: (session: AgentSession) => void): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sero-codemode-subagent-'));
    const workspace = path.join(root, 'workspace');
    const agentDir = path.join(root, 'agent');
    await mkdir(workspace, { recursive: true });

    const fixture = await startProviderFixture(scriptScenario(script));
    await seedFixtureAgentDir(agentDir, { baseUrl: fixture.url });
    const modelRuntime = await ModelRuntime.create({
      authPath: path.join(agentDir, 'auth.json'),
      modelsPath: path.join(agentDir, 'models.json'),
      refreshOnCreate: false,
    });
    const model = modelRuntime.getModel(FIXTURE_PROVIDER_ID, FIXTURE_MODEL_ID);
    if (!model) throw new Error('Fixture model is not registered');
    // A refused call never reaches the manager.
    const manager = { runSingle } as unknown as SubagentManager;
    const loader = new DefaultResourceLoader({
      cwd: workspace,
      agentDir,
      extensionFactories: [
        createSeroCodemodeExtension(),
        (pi) => {
          registerSubagentTool(pi, manager, 'parent-session', 'ws-1');
          registerCreateAgentTool(pi);
        },
      ],
    });
    await loader.reload();
    const { session } = await createAgentSession({
      cwd: workspace,
      agentDir,
      modelRuntime,
      model,
      tools: ['subagent', 'create_agent', 'codemode'],
      resourceLoader: loader,
    });
    activateCodemode(session);
    cleanups.push(async () => {
      session.dispose();
      await fixture.close();
      await rm(root, { recursive: true, force: true });
    });

    opened?.(session);
    await session.prompt('run the script');
    return resultText(session.messages);
  }

  it('passes an owner stop through Code Mode into its active child call', async () => {
    let session!: AgentSession;
    let childStopped = false;
    runSingle.mockImplementation(async ({ signal }: { signal: AbortSignal }) => {
      const stopped = new Promise<void>((resolve) => signal.addEventListener('abort', () => { childStopped = true; resolve(); }, { once: true }));
      void session.abort();
      await stopped;
      return 'Aborted';
    });
    await runScript('await tools.subagent({ systemPrompt: "Inspect", task: "Wait" });', (opened) => { session = opened; });
    expect(childStopped).toBe(true);
  });

  it('stops at a subagent call with no task', async () => {
    const result = await runScript(`await tools.subagent({ systemPrompt: 'You check.' });\ntext(${JSON.stringify(AFTER)});`);

    expect(result).toContain('Script failed');
    expect(result).toContain('"task" is required');
    expect(result).not.toContain(AFTER);
    expect(runSingle).not.toHaveBeenCalled();
  });

  it('stops at a create_agent call with an invalid name', async () => {
    const result = await runScript(`await tools.create_agent({ name: 'Not Valid', description: 'x', systemPrompt: 'x' });\ntext(${JSON.stringify(AFTER)});`);

    expect(result).toContain('Script failed');
    expect(result).toContain("Invalid agent name 'Not Valid'");
    expect(result).not.toContain(AFTER);
  });
});
