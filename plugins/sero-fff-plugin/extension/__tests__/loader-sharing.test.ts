import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it } from 'vitest';

import { resetFinderSdkCache, setFinderSdkForTesting } from '../sdk';
import { createFakeSdk } from './fixtures/fake-finder';

const REGISTRY_KEY = Symbol.for('@sero-ai/plugin-fff/shared-finder-registry');
const extensionPath = fileURLToPath(new URL('../index.ts', import.meta.url));
const globalSymbols = globalThis as typeof globalThis & Record<symbol, unknown>;

let tempRoot: string | undefined;
const sessions: AgentSession[] = [];

async function openSession(cwd: string, agentDir: string): Promise<AgentSession> {
  const settingsManager = SettingsManager.create(cwd, agentDir);
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    additionalExtensionPaths: [extensionPath],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  expect(loader.getExtensions().errors).toEqual([]);

  const { session } = await createAgentSession({
    cwd,
    agentDir,
    noTools: 'builtin',
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager,
  });
  await session.bindExtensions({});
  sessions.push(session);
  return session;
}

afterEach(async () => {
  for (const session of sessions.splice(0)) {
    await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
    session.dispose();
  }
  delete globalSymbols[REGISTRY_KEY];
  resetFinderSdkCache();
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = undefined;
});

describe('Pi extension loader sharing', () => {
  it('keeps one finder per root when the loader cache alternates A, B, A', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-fff-loader-'));
    const rootAPath = path.join(tempRoot, 'a');
    const rootBPath = path.join(tempRoot, 'b');
    const agentDir = path.join(tempRoot, 'agent');
    fs.mkdirSync(rootAPath, { recursive: true });
    fs.mkdirSync(rootBPath, { recursive: true });
    fs.mkdirSync(agentDir, { recursive: true });
    const rootA = fs.realpathSync.native(rootAPath);
    const rootB = fs.realpathSync.native(rootBPath);

    delete globalSymbols[REGISTRY_KEY];
    const sdk = createFakeSdk();
    setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });

    await openSession(rootA, agentDir);
    await openSession(rootB, agentDir);
    await openSession(rootA, agentDir);

    expect(sdk.created.map((finder) => finder.basePath).sort()).toEqual([rootA, rootB].sort());

    for (const session of sessions.splice(0)) {
      await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
      session.dispose();
    }
    expect(sdk.created.every((finder) => finder.destroyed)).toBe(true);
  });
});
