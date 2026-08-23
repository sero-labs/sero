import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  createTempSeroHome,
  currentRuntimeFromEnv,
  launchWorkflowApp,
  runtimeSkipReason,
  type TempSeroHome,
} from './helpers';
import { CONTAINER_BIN } from '../electron/features/container/core/types';

/**
 * Container system e2e tests.
 *
 * These tests exercise the full macOS container lifecycle: ensuring a
 * container is running, executing commands inside it, reading/writing
 * files through the container, and tearing down cleanly.
 *
 * Only runs in the "workflow" Playwright project when
 * SERO_E2E_RUNTIME=apple-container. Skipped automatically on non-macOS
 * and when running with the host runtime.
 *
 * Run locally:
 *   SERO_E2E_RUNTIME=apple-container pnpm --filter @sero/desktop e2e:workflow
 */

const selectedRuntime = currentRuntimeFromEnv() ?? 'host';
const platformSkipReason = runtimeSkipReason('apple-container');
const execFileAsync = promisify(execFile);

test.skip(
  selectedRuntime !== 'apple-container' || platformSkipReason !== null,
  platformSkipReason ?? 'container.workflow.spec.ts requires SERO_E2E_RUNTIME=apple-container',
);

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const availabilitySkipReason = await appleContainerAvailabilitySkipReason();
  test.skip(availabilitySkipReason !== null, availabilitySkipReason ?? 'Apple Container is unavailable.');

  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home, runtime: 'apple-container' }));
  await expect.poll(async () => page.evaluate(() => typeof window.sero?.workspace?.list === 'function'), {
    timeout: 10_000,
  }).toBe(true);
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    home?.cleanup();
  }
});

// ── Helpers ─────────────────────────────────────────────────────

async function appleContainerAvailabilitySkipReason(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(CONTAINER_BIN, ['system', 'status'], { timeout: 10_000 });
    const output = stdout.trim();
    if (/not running|unavailable|not registered/i.test(output) || !/running/i.test(output)) {
      return 'Apple Container system is unavailable.';
    }
    return null;
  } catch {
    return 'Apple Container system is unavailable.';
  }
}

async function getFirstWorkspaceId(): Promise<string | null> {
  return page.evaluate(async () => {
    const workspaces = await (window as any).sero.workspace.list();
    return workspaces.length > 0 ? workspaces[0].id : null;
  });
}

// ── Tests ───────────────────────────────────────────────────────

test.describe('Container - IPC Bridge', () => {
  test('should expose all container IPC methods', async () => {
    const methods = await page.evaluate(() => {
      const c = (window as any).sero.container;
      return {
        status: typeof c.status === 'function',
        inspect: typeof c.inspect === 'function',
        ensure: typeof c.ensure === 'function',
      };
    });
    expect(methods.status).toBe(true);
    expect(methods.inspect).toBe(true);
    expect(methods.ensure).toBe(true);
  });
});

test.describe('Container - Lifecycle', () => {
  test('should return null status for workspace with no container', async () => {
    const wsId = await getFirstWorkspaceId();
    if (!wsId) {
      test.skip();
      return;
    }

    const status = await page.evaluate(async (id: string) => {
      return (window as any).sero.container.status(id);
    }, wsId);

    // No container has been created yet — status should be null
    expect(status).toBeNull();
  });

  test('should ensure a container for a workspace', async () => {
    const wsId = await getFirstWorkspaceId();
    if (!wsId) {
      test.skip();
      return;
    }

    // Enable containers on the workspace first
    await page.evaluate(async (id: string) => {
      await (window as any).sero.workspace.setContainer(id, true);
    }, wsId);

    const state = await page.evaluate(async (id: string) => {
      return (window as any).sero.container.ensure(id);
    }, wsId);

    expect(state).toHaveProperty('id');
    expect(state).toHaveProperty('state');
    expect(state).toHaveProperty('ipAddress');
    expect(state.state).toBe('running');
  });

  test('should report running status after ensure', async () => {
    const wsId = await getFirstWorkspaceId();
    if (!wsId) {
      test.skip();
      return;
    }

    const status = await page.evaluate(async (id: string) => {
      return (window as any).sero.container.status(id);
    }, wsId);

    // If container was created in the previous test, it should be running
    expect(status).not.toBeNull();
    expect(status.state).toBe('running');
    expect(status.ipAddress).toBeTruthy();
  });
});

test.describe('Container - File I/O', () => {
  test('should read a file inside the container', async () => {
    const wsId = await getFirstWorkspaceId();
    if (!wsId) {
      test.skip();
      return;
    }

    // /etc/hostname should exist in any container
    const content = await page.evaluate(async (id: string) => {
      return (window as any).sero.editor.readFile(id, '/etc/hostname');
    }, wsId);

    expect(typeof content).toBe('string');
    expect(content.trim().length).toBeGreaterThan(0);
  });

  test('should write and read back a file in the container', async () => {
    const wsId = await getFirstWorkspaceId();
    if (!wsId) {
      test.skip();
      return;
    }

    const testContent = `e2e-test-${Date.now()}`;
    const testPath = '/workspace/.sero-e2e-test-file';

    const result = await page.evaluate(
      async ({ id, path, content }: { id: string; path: string; content: string }) => {
        await (window as any).sero.editor.writeFile(id, path, content);
        return (window as any).sero.editor.readFile(id, path);
      },
      { id: wsId, path: testPath, content: testContent },
    );

    expect(result).toBe(testContent);
  });

  test('should list files in a container directory', async () => {
    const wsId = await getFirstWorkspaceId();
    if (!wsId) {
      test.skip();
      return;
    }

    const files = await page.evaluate(async (id: string) => {
      return (window as any).sero.editor.listFiles(id, '/workspace');
    }, wsId);

    expect(Array.isArray(files)).toBe(true);
  });
});

test.describe('Container - Command Execution', () => {
  test('should execute a command inside the container', async () => {
    const wsId = await getFirstWorkspaceId();
    if (!wsId) {
      test.skip();
      return;
    }

    const result = await page.evaluate(async (id: string) => {
      return (window as any).sero.editor.exec(id, 'echo "hello from container"');
    }, wsId);

    expect(result.stdout).toContain('hello from container');
    expect(result.exitCode).toBe(0);
  });

  test('should have node available in the container', async () => {
    const wsId = await getFirstWorkspaceId();
    if (!wsId) {
      test.skip();
      return;
    }

    const result = await page.evaluate(async (id: string) => {
      return (window as any).sero.editor.exec(id, 'node --version');
    }, wsId);

    expect(result.stdout).toMatch(/^v\d+\.\d+\.\d+/);
    expect(result.exitCode).toBe(0);
  });

  test('should have git available in the container', async () => {
    const wsId = await getFirstWorkspaceId();
    if (!wsId) {
      test.skip();
      return;
    }

    const result = await page.evaluate(async (id: string) => {
      return (window as any).sero.editor.exec(id, 'git --version');
    }, wsId);

    expect(result.stdout).toContain('git version');
    expect(result.exitCode).toBe(0);
  });
});

test.describe('Container - Terminal', () => {
  test('should expose terminal IPC methods', async () => {
    const methods = await page.evaluate(() => {
      const t = (window as any).sero.terminal;
      return {
        create: typeof t.create === 'function',
        write: typeof t.write === 'function',
        resize: typeof t.resize === 'function',
        dispose: typeof t.dispose === 'function',
        replay: typeof t.replay === 'function',
        onData: typeof t.onData === 'function',
        onExit: typeof t.onExit === 'function',
      };
    });
    expect(methods.create).toBe(true);
    expect(methods.write).toBe(true);
    expect(methods.resize).toBe(true);
    expect(methods.dispose).toBe(true);
    expect(methods.replay).toBe(true);
    expect(methods.onData).toBe(true);
    expect(methods.onExit).toBe(true);
  });

  test('should create and dispose a terminal session', async () => {
    const wsId = await getFirstWorkspaceId();
    if (!wsId) {
      test.skip();
      return;
    }

    const terminalId = `e2e-term-${Date.now()}`;

    const result = await page.evaluate(
      async ({ wsId, termId }: { wsId: string; termId: string }) => {
        await (window as any).sero.terminal.create(wsId, termId, 80, 24);
        // Give the terminal a moment to initialize
        await new Promise((r) => setTimeout(r, 1000));
        await (window as any).sero.terminal.dispose(termId);
        return { created: true };
      },
      { wsId, termId: terminalId },
    );

    expect(result.created).toBe(true);
  });
});

test.describe('Container - Cleanup', () => {
  test('should disable containers on workspace after tests', async () => {
    const wsId = await getFirstWorkspaceId();
    if (!wsId) return;

    // Restore workspace to non-container mode
    await page.evaluate(async (id: string) => {
      await (window as any).sero.workspace.setContainer(id, false);
    }, wsId);
  });
});
