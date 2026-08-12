/**
 * Stage preparation and folder installation for the flagship demo recording.
 *
 * The recording is only honest if the stage is clean before the prompt: no
 * plugin from an earlier run installed, no old sessions in the sidebar, and no
 * plugin panel already open. These helpers run BEFORE the recorder starts,
 * except `installPluginFromFolder`, which is part of the recorded story.
 */

import { execFileSync } from 'node:child_process';
import { expect, type Page } from '@playwright/test';
import { clickForDemo, clickNativeDialogTrigger, type DemoInteractionLog } from './demo';
import { withBoundedRetries } from './demo-media';
import { layout } from './selectors';

export interface DemoPluginIdentity {
  /** `sero.app.id` of the plugin the demo builds. */
  id: string;
  /** `sero.app.name` — the visible panel and App Store card label. */
  name: string;
}

/**
 * Uninstall the demo plugin left by an earlier run.
 *
 * A plugin already installed shows its panel before the prompt, which makes the
 * video claim something the viewer never sees happen.
 */
export async function removeDemoPlugin(page: Page, plugin: DemoPluginIdentity): Promise<void> {
  const installedIds = await page.evaluate(async (identity) => {
    const installed = await window.sero.plugins.list();
    return installed
      .filter((entry) => entry.id === identity.id || entry.name === identity.name)
      .map((entry) => entry.id);
  }, plugin);
  if (installedIds.length === 0) return;

  await page.evaluate(async (ids) => {
    for (const id of ids) await window.sero.plugins.uninstall(id);
  }, installedIds);

  await expect.poll(async () => page.evaluate(async (identity) => {
    const installed = await window.sero.plugins.list();
    return installed.some((entry) => entry.id === identity.id || entry.name === identity.name);
  }, plugin), {
    message: `the ${plugin.name} plugin from an earlier run must be uninstalled before recording`,
    timeout: 30_000,
  }).toBe(false);
}

/** Delete every session in the demo workspace. Other workspaces are untouched. */
export async function deleteWorkspaceSessions(page: Page, workspaceId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const sessions = await window.sero.sessions.list(id);
    for (const session of sessions) await window.sero.sessions.delete(session.path);
  }, workspaceId);

  await expect.poll(
    async () => page.evaluate((id) => window.sero.sessions.list(id).then((s) => s.length), workspaceId),
    { message: 'the demo workspace must start with no sessions', timeout: 30_000 },
  ).toBe(0);
}

/**
 * Close the editor tabs an earlier run left open.
 *
 * Explorer restores its open tabs per workspace when it mounts. The files
 * behind them are gone once the workspace is rebuilt, so the recording opens
 * on a row of stale tabs. Call this before the reload that mounts Explorer.
 */
export async function clearWorkspaceEditorTabs(page: Page, workspaceId: string): Promise<void> {
  await page.evaluate(
    (id) => window.sero.editor.saveState(id, { openTabs: [], activeTab: null }),
    workspaceId,
  );
}

/**
 * Prove through the visible UI that the stage is clean: Explorer is the active
 * panel, no editor tab is open, and the demo plugin is nowhere on screen.
 */
export async function expectCleanDemoStage(page: Page, plugin: DemoPluginIdentity): Promise<void> {
  await expect(
    page.locator('[data-testid="explorer-sidebar-content"]'),
    'Explorer must be open before the prompt',
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.locator('[data-tab-path]'),
    'no editor tab from an earlier run may be open before the prompt',
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: plugin.name, exact: true }),
    `${plugin.name} must not be on screen before the prompt`,
  ).toHaveCount(0);
}

/**
 * Make sure the main sidebar is on screen.
 *
 * `MainSidebar` renders nothing while the sidebar is collapsed, so every
 * control inside it — including `Open App Store` — leaves the page. A panel
 * resize can collapse the sidebar on its own during a long run, so the demo
 * must not assume the sidebar it saw at the start is still there.
 */
export async function ensureMainSidebarOpen(page: Page, log: DemoInteractionLog): Promise<void> {
  const openAppStore = page.getByRole('button', { name: 'Open App Store' });
  if (await openAppStore.isVisible().catch(() => false)) return;

  await clickForDemo(page, page.locator(layout.sidebarToggle), log, { name: 'Toggle sidebar' });
  await openAppStore.waitFor({ state: 'visible', timeout: 10_000 });
}

/** Type a folder path into the macOS open panel and confirm it. */
function selectFolderInNativeDialog(folderPath: string): void {
  execFileSync('osascript', [
    '-e', 'tell application "System Events"',
    '-e', 'keystroke "g" using {command down, shift down}',
    '-e', 'delay 0.5',
    '-e', `keystroke ${JSON.stringify(folderPath)}`,
    '-e', 'delay 0.5',
    '-e', 'key code 36',
    '-e', 'delay 1',
    '-e', 'key code 36',
    '-e', 'end tell',
  ]);
}

/**
 * Install the built plugin through the visible `Install from folder` action,
 * then open it from the App Store.
 *
 * The folder picker is a macOS window. Sero's recorder captures Electron
 * content only, so the picker itself is not in the video — the recording cuts
 * from the click to the installed plugin.
 */
export async function installPluginFromFolder(
  page: Page,
  options: { folderPath: string; plugin: DemoPluginIdentity; log: DemoInteractionLog },
): Promise<void> {
  const { folderPath, plugin, log } = options;
  const openAppStore = page.getByRole('button', { name: 'Open App Store' });

  await ensureMainSidebarOpen(page, log);
  await clickForDemo(page, openAppStore, log, { name: 'Open App Store' });
  await clickNativeDialogTrigger(
    page,
    page.getByRole('button', { name: 'Install from folder' }),
    log,
    { name: 'Install from folder' },
  );
  selectFolderInNativeDialog(folderPath);

  await expect.poll(async () => page.evaluate(async (identity) => {
    const installed = await window.sero.plugins.list();
    return installed.some((entry) => entry.id === identity.id);
  }, plugin), {
    message: `${plugin.name} must install from its folder`,
    timeout: 180_000,
  }).toBe(true);

  // A successful folder install closes the App Store, so reopen it to launch
  // the new plugin the way a person would.
  await withBoundedRetries(async () => {
    const card = page.getByRole('button', { name: `Open ${plugin.name}` });
    if (!(await card.isVisible())) {
      await clickForDemo(page, openAppStore, log, { name: 'Open App Store' });
      await card.waitFor({ state: 'visible', timeout: 10_000 });
    }
    await clickForDemo(page, card, log, { name: `Open ${plugin.name}` });
    await page
      .getByRole('heading', { name: plugin.name, exact: true })
      .waitFor({ state: 'visible', timeout: 30_000 });
    return true;
  }, { attempts: 3, delayMs: 1_000 });
}
