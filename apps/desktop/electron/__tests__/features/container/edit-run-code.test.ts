import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  type AgentSession,
} from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';

import { createHostCodingTools } from '@electron/features/container/tools/tools-host';
import { activateCodemode, createSeroCodemodeExtension } from '@electron/features/codemode';
import {
  seedFixtureAgentDir,
  startProviderFixture,
  type ProviderFixture,
} from '../../agent/fixtures/provider-fixture';
import {
  FIXTURE_MODEL_ID,
  FIXTURE_PROVIDER_ID,
  type ProviderScenario,
} from '../../agent/fixtures/provider-scenarios';

/**
 * The file-mutation rules apply to calls a script makes (spec
 * `file-editing-tools`). The stub provider gives the model one script to run,
 * so the checks go through Pi's `codemode` and a real session tool surface.
 */

interface ScriptRun {
  workspace: string;
  /** The text of the script's own tool result. */
  result: string;
  close(): Promise<void>;
}

/** The script's arguments reach the model as one chunk, so the scenario can build them here. */
function scriptScenario(script: string): ProviderScenario {
  return {
    prompt: 'apply the edits',
    attempts: [
      {
        steps: [{
          kind: 'tool_calls',
          calls: [{
            id: 'call_codemode',
            toolName: 'codemode',
            argChunks: [JSON.stringify({ code: script })],
          }],
        }],
        end: { kind: 'finish', reason: 'tool_calls' },
      },
      {
        steps: [{ kind: 'text', chunks: ['done'] }],
        end: { kind: 'finish', reason: 'stop' },
      },
    ],
  };
}

/** The text the session kept for one tool call. */
function toolResultText(messages: AgentSession['messages'], toolCallId: string): string {
  const parts: string[] = [];
  for (const message of messages) {
    if (message.role !== 'toolResult' || message.toolCallId !== toolCallId) continue;
    for (const block of message.content) {
      if (block.type === 'text') parts.push(block.text);
    }
  }
  return parts.join('\n');
}

/** Write the fixture files, run one script through a real session, and report its result. */
async function runScript(script: string, files: Record<string, string>): Promise<Omit<ScriptRun, 'close'> & { close(): Promise<void> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sero-codemode-edit-'));
  const workspace = path.join(root, 'workspace');
  const agentDir = path.join(root, 'agent');
  await mkdir(workspace, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(workspace, name), content, 'utf8');
  }

  const fixture: ProviderFixture = await startProviderFixture(scriptScenario(script));
  await seedFixtureAgentDir(agentDir, { baseUrl: fixture.url });
  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(agentDir, 'auth.json'),
    modelsPath: path.join(agentDir, 'models.json'),
    refreshOnCreate: false,
  });
  const model = modelRuntime.getModel(FIXTURE_PROVIDER_ID, FIXTURE_MODEL_ID);
  if (!model) throw new Error('Fixture model is not registered');

  const loader = new DefaultResourceLoader({
    cwd: workspace,
    agentDir,
    extensionFactories: [createSeroCodemodeExtension()],
  });
  await loader.reload();
  const { session } = await createAgentSession({
    cwd: workspace,
    agentDir,
    modelRuntime,
    model,
    tools: ['read', 'write', 'edit', 'codemode'],
    customTools: createHostCodingTools(workspace),
    resourceLoader: loader,
  });
  activateCodemode(session);

  let result: string;
  try {
    await session.prompt('apply the edits');
    result = toolResultText(session.messages, 'call_codemode');
  } catch (error) {
    // A failed prompt still owns the resources it created.
    session.dispose();
    await fixture.close();
    await rm(root, { recursive: true, force: true });
    throw error;
  }

  return {
    workspace,
    result,
    close: async () => {
      session.dispose();
      await fixture.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

describe('codemode file mutations', () => {
  it('keeps both compatible edits issued without awaiting each one', async () => {
    const run = await runScript([
      "const first = tools.edit({ path: 'a.ts', oldText: 'one', newText: '1' });",
      "const second = tools.edit({ path: 'a.ts', oldText: 'two', newText: '2' });",
      'const results = await Promise.all([first, second]);',
      'return results.join(" | ");',
    ].join('\n'), { 'a.ts': 'one\ntwo\n' });
    try {
      expect(await readFile(path.join(run.workspace, 'a.ts'), 'utf8')).toBe('1\n2\n');
      expect(run.result).toContain('a.ts');
    } finally {
      await run.close();
    }
  });

  it('fails a conflicting edit without overwriting the first', async () => {
    const run = await runScript([
      "const first = await tools.edit({ path: 'a.ts', oldText: 'target', newText: 'replaced' });",
      'let second;',
      'try {',
      "  second = await tools.edit({ path: 'a.ts', oldText: 'target', newText: 'other' });",
      '} catch (error) {',
      "  second = 'FAILED: ' + (error && error.message ? error.message : String(error));",
      '}',
      "return first.text + ' || ' + second;",
    ].join('\n'), { 'a.ts': 'target\nkeep\n' });
    try {
      expect(await readFile(path.join(run.workspace, 'a.ts'), 'utf8')).toBe('replaced\nkeep\n');
      expect(run.result).toContain('FAILED:');
    } finally {
      await run.close();
    }
  });
});
