import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchSeroApp, layout, workspace, fileTree } from './helpers';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * File tree e2e tests.
 *
 * Verifies the file explorer shows workspace files immediately when
 * a workspace is selected — without requiring a session to be clicked first.
 *
 * Regression test for: file tree empty until a session is selected.
 */

const SERO_TEST_HOME = path.resolve(__dirname, '../.sero-filetree-test');

// ── Helpers ─────────────────────────────────────────────────────

function cleanTestData() {
  fs.rmSync(SERO_TEST_HOME, { recursive: true, force: true });
}

/** Create a temp directory with known test files. Returns absolute path. */
function createTestWorkspaceDir(name: string, files: string[]): string {
  const dir = path.join(os.tmpdir(), `sero-e2e-${name}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of files) {
    const filePath = path.join(dir, file);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `// ${file}\n`, 'utf8');
  }
  return dir;
}

/** Remove a temp workspace directory. */
function cleanWorkspaceDir(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Wait for the app shell to be visible (layout hydrated). */
async function waitForShell(page: Page) {
  await expect(page.locator(layout.appShell).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(layout.sidebarToggle)).toBeVisible({ timeout: 10_000 });
}

/**
 * Add a folder as a workspace via the IPC bridge, disable containers,
 * and trigger a store refresh so the sidebar updates.
 * Returns the workspace info object.
 */
async function addWorkspace(
  page: Page,
  folderPath: string,
  name?: string,
): Promise<{ id: string; name: string; path: string }> {
  return page.evaluate(
    async ({ folderPath, name }) => {
      const sero = (window as any).sero;
      // 1. Register folder via IPC
      const ws = await sero.workspace.addFolder(folderPath, name);
      // 2. Disable container mode so host filesystem is used directly
      await sero.workspace.setContainer(ws.id, false);
      // 3. Dispatch event to trigger Zustand store refresh in WorkspaceTree
      window.dispatchEvent(new Event('sero:workspace-changed'));
      return ws;
    },
    { folderPath, name },
  );
}

/** Click a workspace header in the sidebar. */
async function clickWorkspace(page: Page, wsId: string) {
  const wsNode = page.locator(workspace.nodeById(wsId));
  await expect(wsNode).toBeVisible({ timeout: 10_000 });
  await wsNode.click();
}

/** Wait for the file tree container to be visible and contain items. */
async function waitForFileTree(page: Page) {
  const tree = page.locator(fileTree.container);
  await expect(tree).toBeVisible({ timeout: 10_000 });
  return tree;
}

// ── Tests ───────────────────────────────────────────────────────

test.describe('File tree — workspace click shows files', () => {
  let app: ElectronApplication;
  let page: Page;
  let wsDir: string;
  let wsInfo: { id: string; name: string; path: string };

  const TEST_FILES = [
    'README.md',
    'package.json',
    'src/index.ts',
    'src/utils.ts',
  ];

  test.beforeAll(async () => {
    cleanTestData();
    wsDir = createTestWorkspaceDir('filetree-test', TEST_FILES);

    ({ app, page } = await launchSeroApp({ seroHome: SERO_TEST_HOME }));
    await waitForShell(page);

    // Add workspace and wait for sidebar to pick it up
    wsInfo = await addWorkspace(page, wsDir, 'FileTreeTest');
    await page.waitForTimeout(1000);
  });

  test.afterAll(async () => {
    await app?.close();
    cleanTestData();
    cleanWorkspaceDir(wsDir);
  });

  test('workspace node appears in sidebar', async () => {
    const wsNode = page.locator(workspace.nodeById(wsInfo.id));
    await expect(wsNode).toBeVisible({ timeout: 10_000 });
    await expect(wsNode).toContainText('FileTreeTest');
  });

  test('clicking workspace shows file tree without selecting a session', async () => {
    // Click the workspace header — sets it as active workspace.
    // The file tree should populate in the Explorer panel without
    // needing to select a session first.
    await clickWorkspace(page, wsInfo.id);

    const tree = await waitForFileTree(page);

    // Root-level files should be listed
    await expect(tree.locator('text=README.md')).toBeVisible({ timeout: 10_000 });
    await expect(tree.locator('text=package.json')).toBeVisible({ timeout: 5000 });
    // 'src' directory should also be visible
    await expect(tree.locator('text=src')).toBeVisible({ timeout: 5000 });
  });

  test('file tree items are interactive (expandable folders)', async () => {
    const tree = page.locator(fileTree.container);

    // Click 'src' folder to expand it
    const srcFolder = tree.locator('text=src').first();
    await srcFolder.click();

    // Children should appear after expansion
    await expect(tree.locator('text=index.ts')).toBeVisible({ timeout: 5000 });
    await expect(tree.locator('text=utils.ts')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('File tree — switching workspaces updates file tree', () => {
  let app: ElectronApplication;
  let page: Page;
  let wsDirA: string;
  let wsDirB: string;
  let wsInfoA: { id: string; name: string; path: string };
  let wsInfoB: { id: string; name: string; path: string };

  test.beforeAll(async () => {
    cleanTestData();
    wsDirA = createTestWorkspaceDir('ws-a', ['alpha.ts', 'bravo.ts']);
    wsDirB = createTestWorkspaceDir('ws-b', ['charlie.ts', 'delta.ts']);

    ({ app, page } = await launchSeroApp({ seroHome: SERO_TEST_HOME }));
    await waitForShell(page);

    // Add both workspaces, container disabled
    wsInfoA = await addWorkspace(page, wsDirA, 'WorkspaceAlpha');
    wsInfoB = await addWorkspace(page, wsDirB, 'WorkspaceBravo');

    await page.waitForTimeout(1000);
  });

  test.afterAll(async () => {
    await app?.close();
    cleanTestData();
    cleanWorkspaceDir(wsDirA);
    cleanWorkspaceDir(wsDirB);
  });

  test('clicking workspace A shows its files', async () => {
    await clickWorkspace(page, wsInfoA.id);

    const tree = await waitForFileTree(page);
    await expect(tree.locator('text=alpha.ts')).toBeVisible({ timeout: 10_000 });
    await expect(tree.locator('text=bravo.ts')).toBeVisible({ timeout: 5000 });
    // Should NOT show workspace B files
    await expect(tree.locator('text=charlie.ts')).not.toBeVisible();
    await expect(tree.locator('text=delta.ts')).not.toBeVisible();
  });

  test('switching to workspace B replaces file tree', async () => {
    await clickWorkspace(page, wsInfoB.id);

    const tree = await waitForFileTree(page);
    await expect(tree.locator('text=charlie.ts')).toBeVisible({ timeout: 10_000 });
    await expect(tree.locator('text=delta.ts')).toBeVisible({ timeout: 5000 });
    // Should NOT show workspace A files
    await expect(tree.locator('text=alpha.ts')).not.toBeVisible();
    await expect(tree.locator('text=bravo.ts')).not.toBeVisible();
  });

  test('switching back to workspace A restores its files', async () => {
    await clickWorkspace(page, wsInfoA.id);

    const tree = await waitForFileTree(page);
    await expect(tree.locator('text=alpha.ts')).toBeVisible({ timeout: 10_000 });
    await expect(tree.locator('text=bravo.ts')).toBeVisible({ timeout: 5000 });
  });
});
