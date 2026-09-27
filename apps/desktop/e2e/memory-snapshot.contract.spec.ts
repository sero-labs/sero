import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { closeSeroApp, launchSeroApp } from './helpers';

/**
 * The memory snapshot in a real chat session: old MEMORY.md facts show in the
 * first session after the update, and the system prompt stays byte-identical
 * for the whole session, even after a mid-session save.
 */

interface TestContext {
  app: ElectronApplication;
  page: Page;
  seroHome: string;
  root: string;
}

const OLD_MEMORY = [
  '<!-- last updated: 2026-04-01 12:00 -->',
  '<!-- v2 format: structured memory entries with ids -->',
  '# Memory',
  '',
  '§ [preference] TypeScript over JavaScript <!-- id: mem-aaa111 -->',
  '§ [decision] Chose Vitest for testing <!-- id: mem-bbb222 -->',
].join('\n');

async function createTestContext(): Promise<TestContext> {
  const seroHome = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-memory-snapshot-e2e-'));
  const root = path.join(seroHome, 'workspaces', 'global');
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'IDENTITY.md'), '# Identity\n\n- **Name:** Sero\n- **Style:** Helpful', 'utf8');
  await fs.writeFile(path.join(root, 'USER.md'), '# User\n\n- **Name:** Sam\n- **Role:** Developer', 'utf8');
  await fs.writeFile(path.join(root, 'MEMORY.md'), OLD_MEMORY, 'utf8');

  const { app, page } = await launchSeroApp({ seroHome });
  await expect.poll(async () => page.evaluate(() => {
    return typeof (window as any).sero?.agent?.open === 'function';
  }), { timeout: 10_000 }).toBe(true);

  return { app, page, seroHome, root };
}

async function destroyTestContext(ctx: TestContext): Promise<void> {
  await closeSeroApp(ctx.app);
  await fs.rm(ctx.seroHome, { recursive: true, force: true }).catch(() => {});
}

async function createAndOpenSession(page: Page): Promise<{ id: string }> {
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

/** Plays `before_agent_start` as the next turn would, and returns the system prompt. */
async function emitBeforeAgentStart(app: ElectronApplication, sessionId: string, prompt: string): Promise<string> {
  return app.evaluate(async (_electron, args) => {
    const getAgentPoolEntry = (globalThis as Record<string, unknown>).__seroTestGetAgentPoolEntry as
      | ((sessionId: string) => {
        session: { extensionRunner?: { emitBeforeAgentStart(prompt: string, images: undefined, systemPrompt: string): Promise<{ systemPrompt?: string } | undefined> } };
        baseSystemPrompt: string;
      } | undefined)
      | undefined;
    if (!getAgentPoolEntry) throw new Error('Test helper __seroTestGetAgentPoolEntry is not available');

    const entry = getAgentPoolEntry(args.sessionId);
    if (!entry?.session.extensionRunner) throw new Error(`No active extension runner for session ${args.sessionId}`);

    const result = await entry.session.extensionRunner.emitBeforeAgentStart(args.prompt, undefined, entry.baseSystemPrompt);
    return result?.systemPrompt ?? entry.baseSystemPrompt;
  }, { sessionId, prompt });
}

test.describe('Memory snapshot', () => {
  test('shows old MEMORY.md facts and stays byte-identical after a mid-session save', async () => {
    const ctx = await createTestContext();

    try {
      const session = await createAndOpenSession(ctx.page);
      const firstPrompt = await emitBeforeAgentStart(ctx.app, session.id, 'Tell me a joke');
      expect(firstPrompt).toContain('### Unsorted memories');
      expect(firstPrompt).toContain('TypeScript over JavaScript');
      expect(firstPrompt).toContain('Chose Vitest for testing');

      await runDirectCliPrompt(
        ctx.page,
        session.id,
        'sero memory save --content "Prefers concise PR descriptions" --behaviour "Keep PR descriptions to a short summary and a test list." --type preference --scope global --delivery pinned --terms "pull request, description"',
      );
      await expect.poll(async () => {
        const pinned = await fs.readdir(path.join(ctx.root, 'memory', 'entries', 'pinned')).catch(() => []);
        return pinned.length;
      }, { timeout: 10_000 }).toBe(1);

      const secondPrompt = await emitBeforeAgentStart(ctx.app, session.id, 'What do you remember about my preferences?');
      expect(secondPrompt).toBe(firstPrompt);
    } finally {
      await destroyTestContext(ctx);
    }
  });
});
