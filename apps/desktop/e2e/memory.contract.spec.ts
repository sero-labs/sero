import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

import { closeSeroApp, launchSeroApp } from './helpers';

/**
 * The memory plugin in a running app, with an isolated SERO_HOME:
 *
 * - Opening a chat session delivers `session_start`, which converts an old
 *   MEMORY.md into entry files and keeps a backup.
 * - `sero memory` saves an entry as a file, and removing it moves it to trash.
 */

let app: ElectronApplication;
let page: Page;
let seroHome: string;
let globalRoot: string;

const OLD_MEMORY = [
  '<!-- last updated: 2026-04-01 12:00 -->',
  '<!-- v2 format: structured memory entries with ids -->',
  '# Memory',
  '',
  '§ [preference] Always use pnpm <!-- id: mem-aaa111 -->',
  '§ [decision] Chose Clerk for authentication <!-- id: mem-bbb222 -->',
].join('\n');

test.beforeAll(async () => {
  seroHome = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-memory-test-'));
  globalRoot = path.join(seroHome, 'workspaces', 'global');
  await fs.mkdir(globalRoot, { recursive: true });
  await fs.writeFile(path.join(globalRoot, 'IDENTITY.md'), '# Identity\n\n- **Name:** Sero\n', 'utf8');
  await fs.writeFile(path.join(globalRoot, 'MEMORY.md'), OLD_MEMORY, 'utf8');

  ({ app, page } = await launchSeroApp({ seroHome }));
  await expect.poll(async () => page.evaluate(() => {
    return typeof (window as any).sero?.agent?.open === 'function';
  }), { timeout: 10_000 }).toBe(true);
});

test.afterAll(async () => {
  await closeSeroApp(app);
  await fs.rm(seroHome, { recursive: true, force: true }).catch(() => {});
});

async function openSession(): Promise<{ id: string }> {
  return page.evaluate(async () => {
    const session = await (window as any).sero.sessions.create('global');
    await (window as any).sero.agent.open(session.id, session.path, session.workspaceId);
    return session;
  });
}

async function runDirectCliPrompt(sessionId: string, command: string): Promise<void> {
  await page.evaluate(async ({ sessionId, command }) => {
    await (window as any).sero.agent.prompt(sessionId, command);
  }, { sessionId, command });
}

async function entryFiles(...segments: string[]): Promise<string[]> {
  return fs.readdir(path.join(globalRoot, 'memory', ...segments)).catch(() => []);
}

test.describe('Memory', () => {
  test('converts old MEMORY.md when a chat session opens, before any message', async () => {
    await openSession();

    await expect.poll(async () => (await entryFiles('entries', 'unsorted')).sort(), { timeout: 15_000 })
      .toEqual(['mem-aaa111.md', 'mem-bbb222.md']);
    await expect(fs.access(path.join(globalRoot, 'MEMORY.md'))).rejects.toThrow();
    expect(await fs.readFile(path.join(globalRoot, 'MEMORY.md.v2-backup'), 'utf8')).toBe(OLD_MEMORY);
  });

  test('saves an entry through sero memory, and removing it moves it to trash', async () => {
    const session = await openSession();

    await runDirectCliPrompt(
      session.id,
      'sero memory save --content "Deploys run on fly.io" --behaviour "Use fly.io commands for deploy steps." --type reference --scope global --delivery on-match --terms "deploy, fly"',
    );
    await expect.poll(async () => (await entryFiles('entries', 'on-match')).length, { timeout: 10_000 }).toBe(1);
    const [saved] = await entryFiles('entries', 'on-match');
    const id = saved!.replace(/\.md$/, '');

    await runDirectCliPrompt(session.id, `sero memory remove --id ${id} --reason "The user moved deploys to Render."`);

    await expect.poll(async () => entryFiles('trash'), { timeout: 10_000 }).toEqual([saved]);
    expect(await entryFiles('entries', 'on-match')).toEqual([]);
  });
});
