import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  type AgentSession,
} from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  activateCodemode,
  CODEMODE_TOOL_NAME,
  createSeroCodemodeExtension,
} from '@electron/features/codemode';
import { seedFixtureAgentDir } from '../../agent/fixtures/provider-fixture';

describe('Sero Code Mode wiring', () => {
  let root: string;
  let session: AgentSession | null;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sero-codemode-'));
    const cwd = join(root, 'workspace');
    const agentDir = join(root, 'agent');
    await mkdir(cwd, { recursive: true });
    await seedFixtureAgentDir(agentDir, { baseUrl: 'http://127.0.0.1:1/v1' });
    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, 'auth.json'),
      modelsPath: join(agentDir, 'models.json'),
      refreshOnCreate: false,
    });
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      extensionFactories: [createSeroCodemodeExtension()],
    });
    await loader.reload();
    session = (await createAgentSession({
      cwd,
      agentDir,
      modelRuntime,
      noTools: 'builtin',
      resourceLoader: loader,
    })).session;
  });

  afterEach(async () => {
    session?.dispose();
    session = null;
    await rm(root, { recursive: true, force: true });
  });

  it('registers codemode inactive, then a session switch makes it active', () => {
    if (!session) throw new Error('session was not created');
    expect(session.getAllTools().map((tool) => tool.name)).toContain(CODEMODE_TOOL_NAME);
    expect(session.getActiveToolNames()).not.toContain(CODEMODE_TOOL_NAME);

    activateCodemode(session);

    expect(session.getActiveToolNames()).toContain(CODEMODE_TOOL_NAME);
  });

  it('keeps the rest of the active tool surface when it switches codemode on', () => {
    if (!session) throw new Error('session was not created');
    activateCodemode(session);
    const active = session.getActiveToolNames();

    activateCodemode(session);

    expect(session.getActiveToolNames()).toEqual(active);
  });
});
