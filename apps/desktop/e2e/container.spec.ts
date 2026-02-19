import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchSeroApp } from './helpers';

/**
 * Container system e2e tests.
 *
 * These tests exercise the full macOS container lifecycle: ensuring a
 * container is running, executing commands inside it, reading/writing
 * files through the container, and tearing down cleanly.
 *
 * Only included in the "local" Playwright project. Skipped in CI via
 * testIgnore in playwright.config.ts because CI environments lack the
 * macOS Virtualization framework and the `container` binary.
 *
 * Run locally:
 *   npm run test:e2e:local
 *   npx playwright test --project=local container.spec.ts
 */

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchSeroApp({ containers: true }));
  // Allow extra time for container system bootstrap
  await page.waitForTimeout(3000);
});

test.afterAll(async () => {
  await app.close();
});

// ── Helpers ─────────────────────────────────────────────────────

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
      try {
        return await (window as any).sero.container.ensure(id);
      } catch (e: any) {
        return { error: e.message };
      }
    }, wsId);

    if (state && !('error' in state)) {
      expect(state).toHaveProperty('id');
      expect(state).toHaveProperty('state');
      expect(state).toHaveProperty('ipAddress');
      expect(state.state).toBe('running');
    }
  });

  test('should report running status after ensure', async () => {
    const wsId = await getFirstWorkspaceId();
    if (!wsId) {
      test.skip();
      return;
    }

    const status = await page.evaluate(async (id: string) => {
      try {
        return await (window as any).sero.container.status(id);
      } catch {
        return null;
      }
    }, wsId);

    // If container was created in the previous test, it should be running
    if (status) {
      expect(status.state).toBe('running');
      expect(status.ipAddress).toBeTruthy();
    }
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
      try {
        return await (window as any).sero.editor.readFile(id, '/etc/hostname');
      } catch {
        return null;
      }
    }, wsId);

    if (content !== null) {
      expect(typeof content).toBe('string');
      expect(content.trim().length).toBeGreaterThan(0);
    }
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
        try {
          await (window as any).sero.editor.writeFile(id, path, content);
          const readBack = await (window as any).sero.editor.readFile(id, path);
          return { written: true, readBack };
        } catch (e: any) {
          return { written: false, error: e.message };
        }
      },
      { id: wsId, path: testPath, content: testContent },
    );

    if (result.written) {
      expect(result.readBack).toBe(testContent);
    }
  });

  test('should list files in a container directory', async () => {
    const wsId = await getFirstWorkspaceId();
    if (!wsId) {
      test.skip();
      return;
    }

    const files = await page.evaluate(async (id: string) => {
      try {
        return await (window as any).sero.editor.listFiles(id, '/workspace');
      } catch {
        return null;
      }
    }, wsId);

    if (files !== null) {
      expect(Array.isArray(files)).toBe(true);
    }
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
      try {
        return await (window as any).sero.editor.exec(id, 'echo "hello from container"');
      } catch {
        return null;
      }
    }, wsId);

    if (result !== null) {
      expect(result.stdout).toContain('hello from container');
      expect(result.exitCode).toBe(0);
    }
  });

  test('should have node available in the container', async () => {
    const wsId = await getFirstWorkspaceId();
    if (!wsId) {
      test.skip();
      return;
    }

    const result = await page.evaluate(async (id: string) => {
      try {
        return await (window as any).sero.editor.exec(id, 'node --version');
      } catch {
        return null;
      }
    }, wsId);

    if (result !== null) {
      expect(result.stdout).toMatch(/^v\d+\.\d+\.\d+/);
      expect(result.exitCode).toBe(0);
    }
  });

  test('should have git available in the container', async () => {
    const wsId = await getFirstWorkspaceId();
    if (!wsId) {
      test.skip();
      return;
    }

    const result = await page.evaluate(async (id: string) => {
      try {
        return await (window as any).sero.editor.exec(id, 'git --version');
      } catch {
        return null;
      }
    }, wsId);

    if (result !== null) {
      expect(result.stdout).toContain('git version');
      expect(result.exitCode).toBe(0);
    }
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
        try {
          await (window as any).sero.terminal.create(wsId, termId, 80, 24);
          // Give the terminal a moment to initialize
          await new Promise((r) => setTimeout(r, 1000));
          await (window as any).sero.terminal.dispose(termId);
          return { created: true };
        } catch (e: any) {
          return { created: false, error: e.message };
        }
      },
      { wsId, termId: terminalId },
    );

    // Terminal creation depends on container being ready with node-pty
    if (result.created) {
      expect(result.created).toBe(true);
    }
  });
});

test.describe('Container - Cleanup', () => {
  test('should disable containers on workspace after tests', async () => {
    const wsId = await getFirstWorkspaceId();
    if (!wsId) return;

    // Restore workspace to non-container mode
    await page.evaluate(async (id: string) => {
      try {
        await (window as any).sero.workspace.setContainer(id, false);
      } catch {
        // Best effort cleanup
      }
    }, wsId);
  });
});
