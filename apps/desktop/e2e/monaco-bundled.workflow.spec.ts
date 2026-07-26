import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  createTempSeroHome,
  launchWorkflowApp,
  layout,
  workspace,
  fileTree,
  type TempSeroHome,
} from './helpers';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Monaco must load from our bundle, never from a CDN.
 *
 * @monaco-editor/react defaults to fetching Monaco from jsdelivr. That leaves
 * the editor broken offline and lets a transitive dependency pick the Monaco
 * version, so src/.../editor/monaco-setup.ts points the loader at the bundled
 * copy and wires up the language workers. These tests fail if either half of
 * that setup regresses.
 */

function createTestWorkspaceDir(name: string, files: string[]): string {
  const dir = path.join(os.tmpdir(), `sero-e2e-${name}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of files) {
    const filePath = path.join(dir, file);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `// ${file}\nconst answer = 42;\n`, 'utf8');
  }
  return dir;
}

test.describe('Monaco is bundled', () => {
  let home: TempSeroHome;
  let app: ElectronApplication;
  let page: Page;
  let wsDir: string;
  const externalRequests: string[] = [];

  test.beforeAll(async () => {
    home = createTempSeroHome();
    wsDir = createTestWorkspaceDir('monaco-bundled', ['package.json', 'src/index.ts']);
    fs.writeFileSync(path.join(wsDir, 'broken.json'), '{ "a": 1,, }\n', 'utf8');

    ({ app, page } = await launchWorkflowApp({ home }));

    page.on('request', (req) => {
      const url = req.url();
      if (!url.startsWith('file:') && !url.startsWith('devtools:') && !url.startsWith('data:')) {
        externalRequests.push(url);
      }
    });

    await expect(page.locator(layout.appShell).first()).toBeVisible({ timeout: 15_000 });

    const wsInfo = await page.evaluate(
      async ({ folderPath, name }) => {
        const s = (window as any).sero;
        const info = await s.workspace.addFolder(folderPath, name);
        await s.workspace.setContainer(info.id, false);
        window.dispatchEvent(new Event('sero:workspace-changed'));
        return info;
      },
      { folderPath: wsDir, name: 'MonacoBundled' },
    );

    await page.evaluate(() => (window as any).__appControl?.openApp('explorer'));
    await page.waitForTimeout(500);
    await page.locator(workspace.nodeById(wsInfo.id)).click();
    await expect(page.locator(fileTree.container)).toBeVisible({ timeout: 10_000 });
  });

  test.afterAll(async () => {
    await closeApp(app);
    home.cleanup();
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  test('opening a file mounts a real Monaco editor', async () => {
    await page.locator(fileTree.container).locator('text=package.json').click();

    // The actual Monaco DOM, not just the tab label.
    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.monaco-editor .view-lines').first()).toContainText('answer', {
      timeout: 30_000,
    });
  });

  test('no request was made to a CDN', async () => {
    const cdnHits = externalRequests.filter(
      (u) => u.includes('jsdelivr') || u.includes('unpkg') || u.includes('cdn'),
    );
    expect(cdnHits, `unexpected CDN requests:\n${cdnHits.join('\n')}`).toEqual([]);
  });

  test('our MonacoEnvironment is installed', async () => {
    const hasGetWorker = await page.evaluate(
      () => typeof (globalThis as any).MonacoEnvironment?.getWorker === 'function',
    );
    expect(hasGetWorker).toBe(true);
  });

  test('a language worker actually spawns and reports diagnostics', async () => {
    // Opening the broken JSON file makes Monaco start the json worker; the
    // squiggle only appears if that worker loaded and answered.
    await page.locator(fileTree.container).locator('text=broken.json').click();
    await expect(page.locator('.monaco-editor .squiggly-error').first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
