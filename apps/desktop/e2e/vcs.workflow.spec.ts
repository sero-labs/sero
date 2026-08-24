import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  createTempSeroHome,
  launchWorkflowApp,
  vcs,
  waitForShell,
  type TempSeroHome,
} from './helpers';

/**
 * VCS (Version Control System) functionality e2e tests.
 *
 * Tests the Git-based checkpoint system: listing checkpoints,
 * creating manual checkpoints, viewing diffs, and restoring state.
 */

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let testWorkspaceId: string;
let testWorkspacePath: string;
let workspaceParent: string;

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home }));
  await waitForShell(page);
  workspaceParent = path.join(home.path, 'vcs-workspaces');
  mkdirSync(workspaceParent, { recursive: true });
  execFileSync('git', ['init', '--quiet', workspaceParent]);
  execFileSync('git', ['-C', workspaceParent, 'config', 'user.name', 'Sero E2E']);
  execFileSync('git', ['-C', workspaceParent, 'config', 'user.email', 'e2e@sero.local']);
  const workspace = await page.evaluate(
    (parent) => window.sero.workspace.create('VCS Workflow', parent),
    workspaceParent,
  );
  testWorkspaceId = workspace.id;
  testWorkspacePath = workspace.path;
});

test.afterAll(async () => {
  try {
    if (testWorkspaceId) await page.evaluate((id) => window.sero.workspace.remove(id), testWorkspaceId);
    await closeApp(app);
  } finally {
    home.cleanup();
  }
});

test.describe('VCS - IPC Bridge', () => {
  test('should expose all VCS IPC methods', async () => {
    const methods = await page.evaluate(() => {
      const v = (window as any).sero.vcs;
      const appState = (window as any).sero.appState;
      return {
        listCheckpoints: typeof v.listCheckpoints === 'function',
        getState: typeof v.getState === 'function',
        createCheckpoint: typeof v.createCheckpoint === 'function',
        restore: typeof v.restore === 'function',
        diff: typeof v.diff === 'function',
        refreshState: typeof v.refreshState === 'function',
        onEvent: typeof v.onEvent === 'function',
        // Repo state is pushed via the app-state file subscription
        appStateWatch: typeof appState.watch === 'function',
        appStateUnwatch: typeof appState.unwatch === 'function',
        appStateOnChange: typeof appState.onChange === 'function',
      };
    });
    expect(methods.listCheckpoints).toBe(true);
    expect(methods.getState).toBe(true);
    expect(methods.createCheckpoint).toBe(true);
    expect(methods.restore).toBe(true);
    expect(methods.diff).toBe(true);
    expect(methods.refreshState).toBe(true);
    expect(methods.onEvent).toBe(true);
    expect(methods.appStateWatch).toBe(true);
    expect(methods.appStateUnwatch).toBe(true);
    expect(methods.appStateOnChange).toBe(true);
  });

  test('should subscribe and unsubscribe from VCS events', async () => {
    const result = await page.evaluate(() => {
      const v = (window as any).sero.vcs;
      const unsubscribe = v.onEvent(() => {});
      const isFunction = typeof unsubscribe === 'function';
      unsubscribe(); // Clean up
      return isFunction;
    });
    expect(result).toBe(true);
  });
});

test.describe('VCS - Checkpoint Lifecycle', () => {
  test('should create a manual checkpoint', async () => {
    writeFileSync(path.join(testWorkspacePath, 'vcs-checkpoint.txt'), 'known checkpoint change\n');
    const checkpoint = await page.evaluate(async (wsId: string) => {
      const result = await window.sero.vcs.createCheckpoint(wsId, 'e2e test checkpoint', 'manual');
      if (!result) throw new Error('checkpoint creation returned null for a known change');
      return result;
    }, testWorkspaceId);

    expect(checkpoint).toMatchObject({
      description: expect.stringContaining('e2e test checkpoint'),
      source: 'manual',
    });
    expect(checkpoint.sha).toBeTruthy();
    expect(checkpoint.createdAt).toBeTruthy();
  });

  test('should get diff between checkpoints', async () => {
    writeFileSync(path.join(testWorkspacePath, 'vcs-diff-before.txt'), 'before diff\n');
    const first = await page.evaluate(async (wsId: string) => {
      const first = await window.sero.vcs.createCheckpoint(wsId, 'e2e diff before', 'manual');
      if (!first) throw new Error('first diff checkpoint returned null');
      return first;
    }, testWorkspaceId);

    writeFileSync(path.join(testWorkspacePath, 'vcs-diff-after.txt'), 'after diff\n');
    const status = execFileSync('git', ['-C', testWorkspacePath, 'status', '--porcelain'], { encoding: 'utf8' });
    expect(status).toContain('vcs-diff-after.txt');
    const result = await page.evaluate(async ({ wsId, first }) => {
      const second = await window.sero.vcs.createCheckpoint(wsId, 'e2e diff after', 'manual');
      if (!second) throw new Error('second diff checkpoint returned null');

      const diff = await window.sero.vcs.diff(wsId, first.sha, second.sha);
      return { diff, second };
    }, { wsId: testWorkspaceId, first });

    expect(first.sha).not.toBe(result.second.sha);
    expect(result.diff).toContain('vcs-diff-after.txt');
    expect(result.diff).toContain('+after diff');
  });
});

test.describe('VCS - Repo State Subscription', () => {
  test('should watch and unwatch the pushed git state file', async () => {
    const result = await page.evaluate(async (workspaceId: string) => {
      const workspace = (await window.sero.workspace.list()).find((candidate: { id: string }) => candidate.id === workspaceId);
      if (!workspace) throw new Error('VCS test workspace is missing');
      const filePath = `${workspace.path.replace(/\/+$/, '')}/.sero/apps/vcs-e2e/state.json`;
      const changes: unknown[] = [];
      const unsubscribe = window.sero.appState.onChange((changedPath: string, data: unknown) => {
        if (changedPath === filePath) changes.push(data);
      });

      try {
        const initial = await window.sero.appState.watch(filePath);
        await new Promise((resolve) => setTimeout(resolve, 250));
        await window.sero.appState.write(filePath, { revision: 1 });
        await new Promise((resolve) => setTimeout(resolve, 500));
        const changesAfterWrite = changes.length;

        await window.sero.appState.unwatch(filePath);
        await window.sero.appState.write(filePath, { revision: 2 });
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { initial, changesAfterWrite, changesAfterUnwatch: changes.length };
      } finally {
        unsubscribe();
      }
    }, testWorkspaceId);

    expect((result.initial as { data: unknown }).data).toBeNull();
    expect(result.changesAfterWrite).toBeGreaterThan(0);
    expect(result.changesAfterUnwatch).toBe(result.changesAfterWrite);
  });

  test('should refresh repo state on demand', async () => {
    const workspaces = await page.evaluate(async () => {
      return (window as any).sero.workspace.list();
    });

    if (workspaces.length === 0) {
      test.skip();
      return;
    }

    // Never rejects — git-less workspaces report ok: false with a message
    const result = await page.evaluate(async (wsId: string) => {
      return (window as any).sero.vcs.refreshState(wsId);
    }, workspaces[0].id);

    expect(typeof result.ok).toBe('boolean');
    expect(typeof result.message).toBe('string');
  });
});
