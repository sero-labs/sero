import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { launchSeroApp } from './helpers';
import {
  nowTimestamp,
  serializeMemoryEntries,
} from '@plugins/sero-memory-plugin/extension/memory-format';

interface TestContext {
  app: ElectronApplication;
  page: Page;
  seroHome: string;
  root: string;
}

interface SessionHandle {
  id: string;
  path: string;
  workspaceId: string;
}

async function createTestContext(): Promise<TestContext> {
  const seroHome = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-memory-snapshot-e2e-'));
  const root = path.join(seroHome, 'workspaces', 'global');
  await fs.mkdir(root, { recursive: true });

  await seedManagedFiles(root, [
    { id: 'mem-001', type: 'preference', text: 'TypeScript over JavaScript' },
  ]);

  const { app, page } = await launchSeroApp({
    seroHome,
    env: {
      SERO_MEMORY_NO_SEARCH: '1',
    },
  });
  await page.waitForTimeout(2000);

  return { app, page, seroHome, root };
}

async function destroyTestContext(ctx: TestContext): Promise<void> {
  await ctx.app.close();
  await fs.rm(ctx.seroHome, { recursive: true, force: true }).catch(() => {});
}

async function seedManagedFiles(
  root: string,
  entries: Array<{ id: string; type: string; text: string }>,
): Promise<void> {
  await fs.writeFile(
    path.join(root, 'IDENTITY.md'),
    '# Identity\n\n- **Name:** Sero\n- **Style:** Helpful',
    'utf8',
  );
  await fs.writeFile(
    path.join(root, 'USER.md'),
    '# User\n\n- **Name:** Dan\n- **Role:** Developer',
    'utf8',
  );

  const parsed = entries.map((entry, index) => ({
    id: entry.id,
    hasId: true,
    type: entry.type,
    text: entry.text,
    line: index,
    raw: '',
  }));
  await fs.writeFile(
    path.join(root, 'MEMORY.md'),
    serializeMemoryEntries(parsed, nowTimestamp()),
    'utf8',
  );
}

async function createAndOpenSession(page: Page): Promise<SessionHandle> {
  return page.evaluate(async () => {
    const session = await (window as any).sero.sessions.create('global');
    await (window as any).sero.agent.open(session.id, session.path, session.workspaceId);
    return session;
  });
}

async function runDirectCliPrompt(page: Page, sessionId: string, command: string): Promise<void> {
  await page.evaluate(async ({ sessionId, command }) => {
    await (window as any).sero.agent.prompt(sessionId, command);
  }, { sessionId, command });
}

async function emitBeforeAgentStart(
  app: ElectronApplication,
  sessionId: string,
  prompt: string,
): Promise<string> {
  return app.evaluate(async (_electron, args) => {
    const getAgentPoolEntry = (globalThis as Record<string, unknown>).__seroTestGetAgentPoolEntry as
      | ((sessionId: string) => {
        session: { extensionRunner?: { emitBeforeAgentStart(prompt: string, images: undefined, systemPrompt: string): Promise<{ systemPrompt?: string } | undefined> } };
        baseSystemPrompt: string;
      } | undefined)
      | undefined;

    if (!getAgentPoolEntry) {
      throw new Error('Test helper __seroTestGetAgentPoolEntry is not available');
    }

    const entry = getAgentPoolEntry(args.sessionId);
    if (!entry?.session.extensionRunner) {
      throw new Error(`No active extension runner for session ${args.sessionId}`);
    }

    const result = await entry.session.extensionRunner.emitBeforeAgentStart(
      args.prompt,
      undefined,
      entry.baseSystemPrompt,
    );
    return result?.systemPrompt ?? entry.baseSystemPrompt;
  }, { sessionId, prompt });
}

test.describe('Memory snapshot mode', () => {
  test('frozen mode keeps long-term memory stable after a mid-session write', async () => {
    const ctx = await createTestContext();

    try {
      const session = await createAndOpenSession(ctx.page);
      await runDirectCliPrompt(ctx.page, session.id, 'sero memory config --snapshot frozen');

      const firstPrompt = await emitBeforeAgentStart(ctx.app, session.id, 'Tell me a joke');

      await runDirectCliPrompt(
        ctx.page,
        session.id,
        'sero memory write --target memory --type preference --content "Prefers concise PR descriptions"',
      );

      const memoryContent = await fs.readFile(path.join(ctx.root, 'MEMORY.md'), 'utf8');
      expect(memoryContent).toContain('Prefers concise PR descriptions');

      const secondPrompt = await emitBeforeAgentStart(
        ctx.app,
        session.id,
        'What do you remember about my preferences?',
      );

      expect(secondPrompt).toBe(firstPrompt);
      expect(secondPrompt).not.toContain('Prefers concise PR descriptions');
    } finally {
      await destroyTestContext(ctx);
    }
  });

  test('live mode rebuilds long-term memory after a mid-session write', async () => {
    const ctx = await createTestContext();

    try {
      const session = await createAndOpenSession(ctx.page);
      await runDirectCliPrompt(ctx.page, session.id, 'sero memory config --snapshot live');

      const firstPrompt = await emitBeforeAgentStart(ctx.app, session.id, 'Tell me a joke');

      await runDirectCliPrompt(
        ctx.page,
        session.id,
        'sero memory write --target memory --type preference --content "Prefers concise PR descriptions"',
      );

      const secondPrompt = await emitBeforeAgentStart(
        ctx.app,
        session.id,
        'What do you remember about my preferences?',
      );

      expect(secondPrompt).not.toBe(firstPrompt);
      expect(secondPrompt).toContain('Prefers concise PR descriptions');
    } finally {
      await destroyTestContext(ctx);
    }
  });
});
