/**
 * Agent IPC contract tests.
 *
 * Project: contract. Exercises the agent-related IPC surface
 * (workspaces.list, sessions.create, sessions.list) without
 * touching the rendered UI.
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, createTempSeroHome, launchSeroApp, type TempSeroHome } from './helpers';

let app: ElectronApplication;
let page: Page;
let seroHome: TempSeroHome;

test.beforeAll(async () => {
  seroHome = createTempSeroHome();
  ({ app, page } = await launchSeroApp({ seroHome: seroHome.path }));
  await expect.poll(async () => page.evaluate(() => {
    return typeof (window as any).sero?.workspace?.list === 'function'
      && typeof (window as any).sero?.sessions?.list === 'function'
      && typeof (window as any).sero?.agent?.open === 'function';
  }), { timeout: 10_000 }).toBe(true);
});

test.afterAll(async () => {
  await closeSeroApp(app);
  seroHome.cleanup();
});

test.describe('Agent - Session Management', () => {
  test('should list workspaces via IPC', async () => {
    const workspaces = await page.evaluate(async () => {
      return (window as any).sero.workspace.list();
    });
    expect(Array.isArray(workspaces)).toBe(true);
  });

  test('should create a new session via IPC', async () => {
    // Get the first workspace to create a session in
    const workspaces = await page.evaluate(async () => {
      return (window as any).sero.workspace.list();
    });

    if (workspaces.length === 0) {
      test.skip();
      return;
    }

    const session = await page.evaluate(async (wsId: string) => {
      return (window as any).sero.sessions.create(wsId);
    }, workspaces[0].id);

    expect(session).toBeTruthy();
    expect(session.id).toBeTruthy();
  });

  test('should list sessions via IPC', async () => {
    const sessions = await page.evaluate(async () => {
      return (window as any).sero.sessions.list();
    });
    expect(Array.isArray(sessions)).toBe(true);
  });
});

test.describe('Agent - IPC Bridge', () => {
  test('should expose agent open/close lifecycle', async () => {
    const hasLifecycle = await page.evaluate(() => {
      const agent = (window as any).sero.agent;
      return (
        typeof agent.open === 'function' &&
        typeof agent.close === 'function' &&
        typeof agent.prompt === 'function' &&
        typeof agent.abort === 'function'
      );
    });
    expect(hasLifecycle).toBe(true);
  });

  test('should expose agent event listener', async () => {
    const hasEventListener = await page.evaluate(() => {
      const agent = (window as any).sero.agent;
      return typeof agent.onEvent === 'function';
    });
    expect(hasEventListener).toBe(true);
  });

  test('should expose model management methods', async () => {
    const hasMethods = await page.evaluate(() => {
      const agent = (window as any).sero.agent;
      return {
        getModelState: typeof agent.getModelState === 'function',
        setModel: typeof agent.setModel === 'function',
        setThinkingLevel: typeof agent.setThinkingLevel === 'function',
        getCommands: typeof agent.getCommands === 'function',
      };
    });
    expect(hasMethods.getModelState).toBe(true);
    expect(hasMethods.setModel).toBe(true);
    expect(hasMethods.setThinkingLevel).toBe(true);
    expect(hasMethods.getCommands).toBe(true);
  });

  test('should expose context management methods', async () => {
    const hasMethods = await page.evaluate(() => {
      const agent = (window as any).sero.agent;
      return {
        getContext: typeof agent.getContext === 'function',
        setContextOverrides: typeof agent.setContextOverrides === 'function',
        restoreToCheckpoint: typeof agent.restoreToCheckpoint === 'function',
      };
    });
    expect(hasMethods.getContext).toBe(true);
    expect(hasMethods.setContextOverrides).toBe(true);
    expect(hasMethods.restoreToCheckpoint).toBe(true);
  });
});
