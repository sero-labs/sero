import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import {
  createAgentSession,
  ModelRuntime,
  type AgentSession,
} from '@earendil-works/pi-coding-agent';

import { createHostCodingTools } from '@electron/features/container/tools/tools-host';
import { createRunCodeController } from '@electron/features/code-mode/tool';
import {
  seedFixtureAgentDir,
  startProviderFixture,
  type ProviderFixture,
} from '../../agent/fixtures/provider-fixture';
import {
  FIXTURE_MODEL_ID,
  FIXTURE_PROVIDER_ID,
  PROVIDER_SCENARIOS,
} from '../../agent/fixtures/provider-scenarios';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

interface OpenSessionResult {
  session: AgentSession;
  fixture: ProviderFixture;
  workspace: string;
}

async function openSession(builtInTools: string[]): Promise<OpenSessionResult> {
  const root = await mkdtemp(join(tmpdir(), 'sero-prompt-tools-'));
  const workspace = join(root, 'workspace');
  const agentDir = join(root, 'agent');
  await mkdir(workspace, { recursive: true });

  const fixture = await startProviderFixture(PROVIDER_SCENARIOS.plainText);
  await seedFixtureAgentDir(agentDir, { baseUrl: fixture.url });

  const runtime = await ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: join(agentDir, 'models.json'),
    refreshOnCreate: false,
  });
  const model = runtime.getModel(FIXTURE_PROVIDER_ID, FIXTURE_MODEL_ID);
  if (!model) throw new Error('Fixture model is not registered');

  const runCode = createRunCodeController();
  const { session } = await createAgentSession({
    cwd: workspace,
    agentDir,
    modelRuntime: runtime,
    model,
    tools: [...builtInTools, 'bash', 'read', 'write', 'edit', 'run_code'],
    customTools: [...createHostCodingTools(workspace), runCode.tool],
  });
  runCode.bind(session.agent);

  cleanups.push(async () => {
    session.dispose();
    await fixture.close();
    await rm(root, { recursive: true, force: true });
  });

  return { session, fixture, workspace };
}

describe('core file tools in the session system prompt', () => {
  it('lists the core tools with their summaries instead of reporting none', async () => {
    const { session } = await openSession([]);
    const prompt = session.state.systemPrompt;

    expect(prompt).toContain('Available tools:');
    expect(prompt).not.toContain('(none)');
    for (const name of ['bash', 'read', 'write', 'edit']) {
      expect(prompt).toContain(`- ${name}: `);
    }
    expect(prompt).toContain('several disjoint replacements in one call');
  });

  it('keeps the guideline set consistent with and without search tools active', async () => {
    const { session: plain } = await openSession([]);
    const { session: withSearch } = await openSession(['grep', 'find', 'ls']);

    const plainPrompt = plain.state.systemPrompt;
    const searchPrompt = withSearch.state.systemPrompt;

    // Search tools suppress the injected bash file-operations guideline.
    expect(searchPrompt).not.toContain('Use bash for file operations like ls, rg, find');
    // The batching guidance is additive and survives in both prompt shapes.
    for (const prompt of [plainPrompt, searchPrompt]) {
      expect(prompt).toContain('several edits[] entries instead of several edit calls');
      expect(prompt).toContain('Same-file mutations run in sequence');
    }
  });

  it('activates the runtime-backed edit tool instead of Pi built-in edit', async () => {
    const { session, workspace } = await openSession([]);
    await writeFile(join(workspace, 'a.ts'), 'const value = 1;\n', 'utf8');

    const edit = session.state.tools.find((tool) => tool.name === 'edit');
    if (!edit) throw new Error('edit tool is not active');

    const result = await edit.execute(
      'call-1',
      { path: 'a.ts', oldText: 'const value = 1;', newText: 'const value = 2;' },
      undefined,
    );
    const text = result.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('\n');

    // Sero's runtime tool reports the changed region. Pi's built-in only says
    // "Successfully replaced ...".
    expect(text).toContain('Replaced 1 block in a.ts.');
    expect(text).not.toContain('Successfully replaced');
    expect(text).toContain('+1 const value = 2;');
  });
});
