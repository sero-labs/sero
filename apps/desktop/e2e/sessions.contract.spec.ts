import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchSeroApp } from './helpers/electron-app';
import { createTempSeroHome, type TempSeroHome } from './helpers/seroHome';

test.describe.configure({ mode: 'serial' });

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchSeroApp({
    seroHome: home.path,
    runtime: 'host',
    env: { HOME: home.path, USERPROFILE: home.path, SERO_HOST_FIRST: '1' },
  }));
});

test.afterAll(async () => {
  try {
    await app.close();
  } finally {
    home.cleanup();
  }
});

async function deleteSessionIfPresent(sessionPath: string): Promise<void> {
  await page.evaluate((path) => window.sero.sessions.delete(path), sessionPath);
}

test.describe('sessions IPC contracts without public sessions.get', () => {
  test('creates, lists by workspace, and deletes workspace-bound sessions', async () => {
    const created = await page.evaluate(async () => {
      const workspace = await window.sero.workspace.create('Session Contract');
      const first = await window.sero.sessions.create(workspace.id);
      const second = await window.sero.sessions.create(workspace.id);
      const scoped = await window.sero.sessions.list(workspace.id);
      const all = await window.sero.sessions.list();
      return { workspace, first, second, scoped, all };
    });

    try {
      expect(created.workspace).toEqual(expect.objectContaining({
        id: expect.any(String),
        name: 'Session Contract',
        runtime: expect.objectContaining({ backend: 'host' }),
      }));
      expect(created.first).toEqual(expect.objectContaining({
        id: expect.any(String),
        path: expect.any(String),
        cwd: created.workspace.path,
        workspaceId: created.workspace.id,
        created: expect.any(String),
        modified: expect.any(String),
        messageCount: 0,
        firstMessage: '',
      }));
      expect(created.second).toEqual(expect.objectContaining({
        id: expect.any(String),
        workspaceId: created.workspace.id,
        cwd: created.workspace.path,
      }));
      expect(created.second.id).not.toBe(created.first.id);

      const scopedIds = created.scoped.map((session) => session.id);
      expect(scopedIds).toEqual(expect.arrayContaining([created.first.id, created.second.id]));
      expect(created.scoped.every((session) => session.workspaceId === created.workspace.id)).toBe(true);
      expect(created.scoped.every((session) => session.cwd === created.workspace.path)).toBe(true);
      expect(created.all.map((session) => session.id)).toEqual(expect.arrayContaining(scopedIds));

      await page.evaluate((path) => window.sero.sessions.delete(path), created.first.path);
      const afterFirstDelete = await page.evaluate(
        (workspaceId) => window.sero.sessions.list(workspaceId),
        created.workspace.id,
      );
      expect(afterFirstDelete.some((session) => session.id === created.first.id)).toBe(false);
      expect(afterFirstDelete.some((session) => session.id === created.second.id)).toBe(true);

      await page.evaluate((path) => window.sero.sessions.delete(path), created.second.path);
      const afterSecondDelete = await page.evaluate(
        (workspaceId) => window.sero.sessions.list(workspaceId),
        created.workspace.id,
      );
      expect(afterSecondDelete.some((session) => session.id === created.second.id)).toBe(false);
    } finally {
      await page.evaluate((id) => window.sero.workspace.remove(id), created.workspace.id);
      await deleteSessionIfPresent(created.first.path);
      await deleteSessionIfPresent(created.second.path);
    }
  });

  test('uses create/list and agent.open as the public get-equivalent behavior', async () => {
    const setup = await page.evaluate(async () => {
      const workspace = await window.sero.workspace.create('Session Open Contract');
      const session = await window.sero.sessions.create(workspace.id);
      const messages = await window.sero.agent.open(session.id, session.path, workspace.id);
      await window.sero.agent.close(session.id);
      const listed = await window.sero.sessions.list(workspace.id);
      return { workspace, session, messages, listed };
    });

    try {
      expect(setup.session).toEqual(expect.objectContaining({
        id: expect.any(String),
        path: expect.any(String),
        workspaceId: setup.workspace.id,
      }));
      expect(setup.messages).toEqual([]);
      expect(setup.listed).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: setup.session.id, path: setup.session.path }),
      ]));
    } finally {
      await page.evaluate((id) => window.sero.workspace.remove(id), setup.workspace.id);
      await deleteSessionIfPresent(setup.session.path);
    }
  });

  test('keeps deterministic listener plumbing isolated across opened sessions', async () => {
    const result = await page.evaluate(async () => {
      const workspace = await window.sero.workspace.create('Session Listener Contract');
      const first = await window.sero.sessions.create(workspace.id);
      const second = await window.sero.sessions.create(workspace.id);
      const events: Array<{ sessionId?: string; workspaceId?: string; type: string }> = [];
      const unsubscribe = window.sero.agent.onEvent((event) => {
        events.push({
          type: event.type,
          sessionId: event.sessionId,
          workspaceId: 'workspaceId' in event ? event.workspaceId : undefined,
        });
      });
      const unsubscribeType = typeof unsubscribe;

      try {
        const firstMessages = await window.sero.agent.open(first.id, first.path, workspace.id);
        const secondMessages = await window.sero.agent.open(second.id, second.path, workspace.id);
        await window.sero.agent.close(first.id);
        await window.sero.agent.close(second.id);
        unsubscribe();
        return { workspace, first, second, firstMessages, secondMessages, events, unsubscribeType };
      } catch (error) {
        unsubscribe();
        throw error;
      }
    });

    try {
      expect(result.unsubscribeType).toBe('function');
      expect(result.firstMessages).toEqual([]);
      expect(result.secondMessages).toEqual([]);

      const allowedSessionIds = new Set([result.first.id, result.second.id]);
      for (const event of result.events) {
        if (event.sessionId) expect(allowedSessionIds.has(event.sessionId)).toBe(true);
        if (event.workspaceId) expect(event.workspaceId).toBe(result.workspace.id);
      }
      // Host runtime opens do not emit a guaranteed no-LLM event today; concurrent
      // streaming isolation is intentionally deferred to the agent-realism layer.
    } finally {
      await page.evaluate((id) => window.sero.workspace.remove(id), result.workspace.id);
      await deleteSessionIfPresent(result.first.path);
      await deleteSessionIfPresent(result.second.path);
    }
  });
});
