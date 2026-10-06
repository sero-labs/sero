/**
 * Pi's own deferral and `tool_search`, run on a real session with no model call.
 * These prove what the host relies on: the allowlist is the hard bound, a
 * deferred tool is found and loaded without a new session, Code Mode can only
 * call what the session registered, and a reopened session loads only what it
 * registers again.
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  type AgentSession,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CODEMODE_TOOL_NAME, createSeroCodemodeExtension } from '@electron/features/codemode';
import {
  createSeroToolSearchExtension,
  deferToolsOutside,
  loadoutWithLoaded,
  TOOL_SEARCH_TOOL_NAME,
} from '@electron/features/tool-loadout';
import { seedFixtureAgentDir } from '../../agent/fixtures/provider-fixture';

function tool(name: string, description: string): ToolDefinition {
  return {
    name,
    label: name,
    description,
    parameters: Type.Object({}),
    execute: async () => ({ content: [{ type: 'text', text: name }], details: undefined }),
  };
}

const ALPHA = tool('alpha_reader', 'Read the alpha ledger');
const BETA = tool('beta_publisher', 'Publish the beta report to the team');
const GAMMA = tool('gamma_secret', 'Open the gamma vault');

describe('authorized tools versus loaded tools on a real Pi session', () => {
  let root: string;
  let cwd: string;
  let agentDir: string;
  let modelRuntime: ModelRuntime;
  const open: AgentSession[] = [];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sero-tool-loadout-'));
    cwd = join(root, 'workspace');
    agentDir = join(root, 'agent');
    await mkdir(cwd, { recursive: true });
    await seedFixtureAgentDir(agentDir, { baseUrl: 'http://127.0.0.1:1/v1' });
    modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, 'auth.json'),
      modelsPath: join(agentDir, 'models.json'),
      refreshOnCreate: false,
    });
  });

  afterEach(async () => {
    for (const session of open.splice(0)) session.dispose();
    await rm(root, { recursive: true, force: true });
  });

  /** The session the host builds: `authorized` is registered, `loadout` starts loaded. */
  async function openSession(authorized: ToolDefinition[], loadout: string[], sessionManager: SessionManager) {
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      extensionFactories: [createSeroCodemodeExtension(), createSeroToolSearchExtension()],
    });
    await loader.reload();
    const { session } = await createAgentSession({
      cwd,
      agentDir,
      modelRuntime,
      noTools: 'builtin',
      resourceLoader: loader,
      sessionManager,
      customTools: deferToolsOutside(authorized, new Set(loadout)),
      tools: [...authorized.map((entry) => entry.name), TOOL_SEARCH_TOOL_NAME, CODEMODE_TOOL_NAME],
    });
    // Pi declares every tool the list names, deferred ones included, so the host narrows it.
    session.setActiveToolsByName([...loadout, TOOL_SEARCH_TOOL_NAME]);
    open.push(session);
    return session;
  }

  async function search(session: AgentSession, query: string): Promise<void> {
    const searchTool = session.getToolDefinition(TOOL_SEARCH_TOOL_NAME);
    await searchTool?.execute('call-1', { query }, undefined, undefined, undefined as never);
  }

  it('declares only the loadout, registers the rest, and never registers a tool outside the authorized set', async () => {
    const session = await openSession([ALPHA, BETA], [ALPHA.name], SessionManager.inMemory(cwd));

    expect(session.getActiveToolNames()).toContain(ALPHA.name);
    expect(session.getActiveToolNames()).not.toContain(BETA.name);
    expect(session.getAllTools().map((entry) => entry.name)).toContain(BETA.name);
    expect(session.getAllTools().map((entry) => entry.name)).not.toContain(GAMMA.name);
  });

  it('loads a deferred tool in the same session, and a search cannot find a tool that was never registered', async () => {
    const session = await openSession([ALPHA, BETA], [ALPHA.name], SessionManager.inMemory(cwd));

    await search(session, 'publish the report');
    await search(session, 'gamma vault');

    expect(session.getActiveToolNames()).toContain(BETA.name);
    expect(session.getActiveToolNames()).not.toContain(GAMMA.name);
  });

  it('lets Code Mode call only registered tools, so an unauthorized tool is not callable', async () => {
    const session = await openSession([ALPHA, BETA], [ALPHA.name], SessionManager.inMemory(cwd));

    const callable = session.getCallableToolNames();

    // Deferred tools stay callable from a script: each still runs its own checks when called.
    expect(callable).toContain(BETA.name);
    expect(callable).not.toContain(GAMMA.name);
  });

  it('reopens by registering the same set, and does not register a tool that was turned off in between', async () => {
    const sessionDir = join(root, 'sessions');
    const first = await openSession([ALPHA, BETA], [ALPHA.name], SessionManager.create(cwd, sessionDir));
    const registered = first.getAllTools().map((entry) => entry.name).sort();
    const file = first.sessionManager.getSessionFile();
    expect(file).toBeTruthy();
    first.dispose();

    const same = await openSession([ALPHA, BETA], [ALPHA.name], SessionManager.open(file ?? ''));
    expect(same.getAllTools().map((entry) => entry.name).sort()).toEqual(registered);
    same.dispose();

    // The user turned it off between the two opens: it is not registered, so nothing can load or call it.
    const without = await openSession([ALPHA], [ALPHA.name], SessionManager.open(file ?? ''));
    expect(without.getAllTools().map((entry) => entry.name)).not.toContain(BETA.name);
    expect(without.getCallableToolNames()).not.toContain(BETA.name);
    await search(without, 'publish the report');
    expect(without.getActiveToolNames()).not.toContain(BETA.name);
  });

  it('reloads on reopen what the session had loaded, but never a tool it no longer registers', async () => {
    const session = await openSession([ALPHA, BETA], [ALPHA.name], SessionManager.create(cwd, join(root, 'sessions')));
    const declared = (definition: ToolDefinition) => ({ name: definition.name, description: definition.description, parameters: definition.parameters });
    const saved = [{ role: 'system' as const, content: '', toolsAdded: [declared(BETA), declared(GAMMA)], timestamp: 1 }];

    session.setActiveToolsByName(loadoutWithLoaded([ALPHA.name, TOOL_SEARCH_TOOL_NAME], saved));

    expect(session.getActiveToolNames()).toEqual(expect.arrayContaining([ALPHA.name, BETA.name]));
    expect(session.getActiveToolNames()).not.toContain(GAMMA.name);
  });
});
