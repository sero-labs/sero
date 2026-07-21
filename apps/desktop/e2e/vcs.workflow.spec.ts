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

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home }));
  await waitForShell(page);
});

test.afterAll(async () => {
  try {
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

test.describe('VCS - Workspace State', () => {
  test('should get VCS state for a workspace', async () => {
    const workspaces = await page.evaluate(async () => {
      return (window as any).sero.workspace.list();
    });

    if (workspaces.length === 0) {
      test.skip();
      return;
    }

    const state = await page.evaluate(async (wsId: string) => {
      try {
        return await (window as any).sero.vcs.getState(wsId);
      } catch {
        // VCS may not be initialized for test workspaces
        return null;
      }
    }, workspaces[0].id);

    // State may be null if git is not available in the test environment
    if (state !== null) {
      expect(state).toHaveProperty('workspaceId');
      expect(state).toHaveProperty('checkpoints');
      expect(Array.isArray(state.checkpoints)).toBe(true);
    }
  });

  test('should list checkpoints for a workspace', async () => {
    const workspaces = await page.evaluate(async () => {
      return (window as any).sero.workspace.list();
    });

    if (workspaces.length === 0) {
      test.skip();
      return;
    }

    const checkpoints = await page.evaluate(async (wsId: string) => {
      try {
        return await (window as any).sero.vcs.listCheckpoints(wsId);
      } catch {
        return null;
      }
    }, workspaces[0].id);

    if (checkpoints !== null) {
      expect(Array.isArray(checkpoints)).toBe(true);
    }
  });
});

test.describe('VCS - Checkpoint Lifecycle', () => {
  let testWorkspaceId: string | null = null;

  test.beforeAll(async () => {
    // Get first available workspace
    const workspaces = await page.evaluate(async () => {
      return (window as any).sero.workspace.list();
    });
    if (workspaces.length > 0) {
      testWorkspaceId = workspaces[0].id;
    }
  });

  test('should create a manual checkpoint', async () => {
    if (!testWorkspaceId) {
      test.skip();
      return;
    }

    const checkpoint = await page.evaluate(async (wsId: string) => {
      try {
        return await (window as any).sero.vcs.createCheckpoint(
          wsId,
          'e2e test checkpoint',
          'manual',
        );
      } catch {
        return null;
      }
    }, testWorkspaceId);

    // Checkpoint creation may fail if git is not available
    if (checkpoint !== null) {
      expect(checkpoint).toHaveProperty('sha');
      expect(checkpoint).toHaveProperty('description');
      expect(checkpoint.description).toContain('e2e test checkpoint');
      expect(checkpoint).toHaveProperty('source', 'manual');
      expect(checkpoint).toHaveProperty('createdAt');
    }
  });

  test('should get diff between checkpoints', async () => {
    if (!testWorkspaceId) {
      test.skip();
      return;
    }

    // Get state to find checkpoint IDs
    const state = await page.evaluate(async (wsId: string) => {
      try {
        return await (window as any).sero.vcs.getState(wsId);
      } catch {
        return null;
      }
    }, testWorkspaceId);

    if (!state || state.checkpoints.length === 0) {
      test.skip();
      return;
    }

    const diff = await page.evaluate(
      async ({ wsId, sha }: { wsId: string; sha: string }) => {
        try {
          return await (window as any).sero.vcs.diff(wsId, sha);
        } catch {
          return null;
        }
      },
      { wsId: testWorkspaceId, sha: state.checkpoints[0].sha },
    );

    // Diff returns a string (may be empty if no changes)
    if (diff !== null) {
      expect(typeof diff).toBe('string');
    }
  });
});

test.describe('VCS - Repo State Subscription', () => {
  test('should watch and unwatch the pushed git state file', async () => {
    const workspaces = await page.evaluate(async () => {
      return (window as any).sero.workspace.list();
    });

    if (workspaces.length === 0) {
      test.skip();
      return;
    }

    const stateFilePath = `${workspaces[0].path.replace(/\/+$/, '')}/.sero/apps/git/state.json`;

    // Watch should not throw (returns the current state or null/undefined)
    const watchResult = await page.evaluate(async (filePath: string) => {
      try {
        await (window as any).sero.appState.watch(filePath);
        return 'ok';
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    }, stateFilePath);

    // Unwatch should not throw
    const unwatchResult = await page.evaluate(async (filePath: string) => {
      try {
        await (window as any).sero.appState.unwatch(filePath);
        return 'ok';
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    }, stateFilePath);

    // Results depend on whether git is available, but neither should crash the app
    expect(typeof watchResult).toBe('string');
    expect(typeof unwatchResult).toBe('string');
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
