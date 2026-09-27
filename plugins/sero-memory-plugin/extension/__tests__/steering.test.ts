/**
 * A message steered into a running turn gets no recall and raises no error
 * (design D6). Runs the memory extension in a real Pi session on Pi's faux
 * provider, because only a real session shows what `steer()` emits.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ExtensionError,
} from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The native index is not loaded in unit tests; search runs on keywords.
vi.mock('../qmd-index', async (importOriginal) => ({
  ...await importOriginal<typeof import('../qmd-index')>(),
  warmUp: vi.fn(async () => false),
  acquireIndex: vi.fn(async () => false),
  releaseIndex: vi.fn(async () => undefined),
  refreshIndex: vi.fn(async () => undefined),
}));

const loggedErrors = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../logger', async (importOriginal) => ({
  ...await importOriginal<typeof import('../logger')>(),
  error: loggedErrors,
}));

import { globalLocation, writeEntry } from '../entry-store';
import memoryExtension from '../index';
import { getIdentityPath, getUserPath, resolveMemoryRoot } from '../memory-manager';
import { RECALL_MESSAGE_TYPE } from '../recall';
import { tidyStatePath } from '../tidy';

const originalEnv = { SERO_HOME: process.env.SERO_HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };
const MATCHING_MESSAGE = 'Which package manager should I use to add a dependency?';

describe('steering during a turn', () => {
  let root = '';
  let session: AgentSession | undefined;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-steer-'));
    process.env.SERO_HOME = path.join(root, 'profile');
    process.env.PI_CODING_AGENT_DIR = path.join(root, 'profile', 'agent');
    await mkdir(resolveMemoryRoot(), { recursive: true });
    await writeFile(getIdentityPath(resolveMemoryRoot()), '# Identity\n\n- **Name:** Sero\n');
    await writeFile(getUserPath(resolveMemoryRoot()), '# User\n\n- **Role:** Developer\n');
    await writeEntry(globalLocation(), {
      id: 'mem-pnpm',
      type: 'preference',
      scope: 'global',
      created: '2026-09-01',
      confirmed: '2026-09-01',
      replaces: [],
      terms: ['pnpm', 'package manager', 'dependency'],
      body: 'JS/TS projects use pnpm.\n\nBehaviour: Run pnpm to add packages.',
    }, 'on-match');
    // The weekly tidy-up asks a model; mark it as just run so this test covers steering only.
    await mkdir(path.dirname(tidyStatePath(globalLocation())), { recursive: true });
    await writeFile(tidyStatePath(globalLocation()), JSON.stringify({ lastRun: new Date().toISOString() }));
    loggedErrors.mockClear();
  });

  afterEach(async () => {
    session?.dispose();
    session = undefined;
    process.env.SERO_HOME = originalEnv.SERO_HOME;
    process.env.PI_CODING_AGENT_DIR = originalEnv.PI_CODING_AGENT_DIR;
    await rm(root, { recursive: true, force: true });
  });

  it('adds no recall for a steered message, and recalls the same memory for a new prompt', async () => {
    const faux = fauxProvider({ provider: 'faux-memory', models: [{ id: 'faux-model' }] });
    const modelRuntime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      allowModelNetwork: false,
    });
    new ModelRegistry(modelRuntime).registerProvider(faux.provider);
    await modelRuntime.setRuntimeApiKey('faux-memory', 'test-key');
    const model = modelRuntime.getModel('faux-memory', 'faux-model');
    if (!model) throw new Error('Expected the faux model to be registered.');

    const workspace = path.join(root, 'project');
    const agentDir = process.env.PI_CODING_AGENT_DIR!;
    await mkdir(workspace, { recursive: true });
    const settingsManager = SettingsManager.inMemory();
    const resourceLoader = new DefaultResourceLoader({
      cwd: workspace,
      agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      extensionFactories: [memoryExtension],
    });
    await resourceLoader.reload();
    session = (await createAgentSession({
      cwd: workspace,
      agentDir,
      modelRuntime,
      model,
      tools: [],
      resourceLoader,
      sessionManager: SessionManager.inMemory(workspace),
      settingsManager,
    })).session;
    const extensionErrors: ExtensionError[] = [];
    session.extensionRunner.onError((err) => extensionErrors.push(err));
    await session.bindExtensions({});

    // The first reply waits until the steered message is queued, so the steer lands mid-turn.
    let steered: () => void = () => undefined;
    const steerQueued = new Promise<void>((resolve) => { steered = resolve; });
    faux.setResponses([
      async () => { await steerQueued; return fauxAssistantMessage('first reply'); },
      fauxAssistantMessage('reply to the steered message'),
      fauxAssistantMessage('reply to the new prompt'),
    ]);

    const running = session.prompt('hello');
    await vi.waitFor(() => expect(session!.isStreaming).toBe(true));
    await session.steer(MATCHING_MESSAGE);
    steered();
    await running;
    await session.waitForIdle();

    const recallsAfter = (s: AgentSession) => s.messages.filter(
      (m) => m.role === 'custom' && m.customType === RECALL_MESSAGE_TYPE,
    );
    const texts = session.messages.map((m) => (m.role === 'user' && typeof m.content !== 'string'
      ? m.content.map((part) => (part.type === 'text' ? part.text : '')).join('')
      : m.role === 'user' ? m.content : ''));
    expect(texts).toContain(MATCHING_MESSAGE);
    expect(recallsAfter(session)).toHaveLength(0);
    expect(extensionErrors).toEqual([]);
    expect(loggedErrors).not.toHaveBeenCalled();

    // The same words as a new prompt do recall, so the check above is not vacuous.
    await session.prompt(MATCHING_MESSAGE);
    expect(recallsAfter(session).map((m) => (m.details as { ids: string[] }).ids)).toEqual([['mem-pnpm']]);
  });
});
