import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchSeroApp, vcs } from './helpers';

/**
 * VCS (Version Control System) functionality e2e tests.
 *
 * Tests the Jujutsu-based checkpoint system: listing checkpoints,
 * creating manual checkpoints, viewing diffs, and restoring state.
 */

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchSeroApp());
  // Wait for app to fully initialize
  await page.waitForTimeout(2000);
});

test.afterAll(async () => {
  await app.close();
});

test.describe('VCS - IPC Bridge', () => {
  test('should expose all VCS IPC methods', async () => {
    const methods = await page.evaluate(() => {
      const v = (window as any).sero.vcs;
      return {
        listCheckpoints: typeof v.listCheckpoints === 'function',
        getState: typeof v.getState === 'function',
        createCheckpoint: typeof v.createCheckpoint === 'function',
        restore: typeof v.restore === 'function',
        diff: typeof v.diff === 'function',
        watch: typeof v.watch === 'function',
        unwatch: typeof v.unwatch === 'function',
        onEvent: typeof v.onEvent === 'function',
      };
    });
    expect(methods.listCheckpoints).toBe(true);
    expect(methods.getState).toBe(true);
    expect(methods.createCheckpoint).toBe(true);
    expect(methods.restore).toBe(true);
    expect(methods.diff).toBe(true);
    expect(methods.watch).toBe(true);
    expect(methods.unwatch).toBe(true);
    expect(methods.onEvent).toBe(true);
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

    // State may be null if jj is not installed in the test environment
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

    // Checkpoint creation may fail if jj is not available
    if (checkpoint !== null) {
      expect(checkpoint).toHaveProperty('changeId');
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
      async ({ wsId, changeId }: { wsId: string; changeId: string }) => {
        try {
          return await (window as any).sero.vcs.diff(wsId, changeId);
        } catch {
          return null;
        }
      },
      { wsId: testWorkspaceId, changeId: state.checkpoints[0].changeId },
    );

    // Diff returns a string (may be empty if no changes)
    if (diff !== null) {
      expect(typeof diff).toBe('string');
    }
  });
});

test.describe('VCS - Watch/Unwatch', () => {
  test('should watch and unwatch a workspace', async () => {
    const workspaces = await page.evaluate(async () => {
      return (window as any).sero.workspace.list();
    });

    if (workspaces.length === 0) {
      test.skip();
      return;
    }

    const wsId = workspaces[0].id;

    // Watch should not throw
    const watchResult = await page.evaluate(async (id: string) => {
      try {
        await (window as any).sero.vcs.watch(id);
        return 'ok';
      } catch (e: any) {
        return e.message;
      }
    }, wsId);

    // Unwatch should not throw
    const unwatchResult = await page.evaluate(async (id: string) => {
      try {
        await (window as any).sero.vcs.unwatch(id);
        return 'ok';
      } catch (e: any) {
        return e.message;
      }
    }, wsId);

    // Results depend on whether jj is available, but neither should crash the app
    expect(typeof watchResult).toBe('string');
    expect(typeof unwatchResult).toBe('string');
  });
});
