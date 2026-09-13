/**
 * Output optimizer settings workflow.
 *
 * Project: workflow. Drives the plugin's own settings surface through the
 * rendered Electron UI. No model turn and no shell command is involved: the
 * extension owns config, RTK status and accounting, and this surface only reads
 * a snapshot and writes changes through the plugin's `output_optimizer` tool.
 *
 * Live command rewriting/compaction behaviour is covered in
 * `output-optimizer.agent.spec.ts` (project: agent).
 */

import { test, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import {
  closeApp,
  createTempSeroHome,
  createWorkspaceDir,
  launchWorkflowApp,
  layout,
  waitForShell,
  workspace,
  type TempSeroHome,
} from './helpers';

const APP_ID = 'output-optimizer';
const PER_CLASS_LABELS = [
  'File reads',
  'Git',
  'Containers',
  'GitHub',
  'Tests',
  'Builds and type checks',
  'Package managers',
  'Other',
];
const RESOLVED_RTK_STATES = ['available', 'installing', 'failed'];

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

async function openSettings(): Promise<Locator> {
  const opened = await page.evaluate((id) => Boolean(window.__appControl?.openApp(id)), APP_ID);
  expect(opened).toBe(true);
  const panel = page.locator(layout.activeAppPanel).first();
  await expect(panel.locator(`[data-app="${APP_ID}"]`).first()).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByRole('heading', { name: 'Output optimizer' })).toBeVisible({ timeout: 10_000 });
  return panel;
}

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({
    home,
    runtime: 'host',
    env: { SERO_HOST_FIRST: '1' },
  }));
  await waitForShell(page);

  // The settings app only mounts against an active workspace, so create and
  // select one before opening the surface.
  const workspaceDir = createWorkspaceDir(home.path, 'optimizer settings workspace', {
    'README.md': '# optimizer settings\n',
  });
  const ws = await page.evaluate(async ({ folderPath, name }) => {
    const created = await window.sero.workspace.addFolder(folderPath, name);
    window.dispatchEvent(new Event('sero:workspace-changed'));
    return created;
  }, { folderPath: workspaceDir, name: 'Optimizer Settings Workspace' });

  await expect(page.locator(workspace.nodeById(ws.id))).toBeVisible({ timeout: 10_000 });
  await page.locator(workspace.nodeById(ws.id)).click();
  await expect.poll(() => page.evaluate(() => window.sero.layout.load()), {
    timeout: 10_000,
  }).toMatchObject({ activeWorkspaceId: ws.id });
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    home.cleanup();
  }
});

test.describe('Output optimizer settings surface', () => {
  test('shows enable, notices, RTK state and version, retry, per-class switches and session savings', async () => {
    const panel = await openSettings();

    // Enable and notices toggles.
    await expect(panel.getByText('Enable output optimisation')).toBeVisible();
    await expect(panel.getByText('Show optimisation notices')).toBeVisible();

    // RTK state, its version line and the Retry control.
    await expect(panel.getByText('RTK toolchain')).toBeVisible();
    await expect(panel.locator('[data-slot="badge"]')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(panel.getByText(/Version |No verified version/)).toBeVisible();

    // One independent switch per rewrite class.
    for (const label of PER_CLASS_LABELS) {
      await expect(panel.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(panel.locator('button[role="switch"], [data-slot="switch"]')).toHaveCount(PER_CLASS_LABELS.length + 2);

    // Session savings accounting.
    await expect(panel.getByText('Session savings')).toBeVisible();
    await expect(panel.getByText('Measured calls', { exact: true })).toBeVisible();
    await expect(panel.getByText('Unmeasured calls', { exact: true })).toBeVisible();
    await expect(panel.getByText('Input bytes', { exact: true })).toBeVisible();
    await expect(panel.getByText('Compacted bytes', { exact: true })).toBeVisible();
    await expect(panel.getByText('Reduction', { exact: true })).toBeVisible();
  });

  test('pressing Retry leaves the RTK state unknown and reports a real reason', async () => {
    const panel = await openSettings();
    const badge = panel.locator('[data-slot="badge"]').first();
    await expect(badge).toHaveText('unknown');

    await panel.getByRole('button', { name: 'Retry' }).click();

    // Retry resolves RTK and republishes the status, so the badge leaves
    // `unknown`. A failure is allowed, but the reason must be a real one, not a
    // session-ownership mismatch.
    await expect(badge).toHaveText(new RegExp(`^(${RESOLVED_RTK_STATES.join('|')})$`), { timeout: 60_000 });
    await expect(panel.getByText(/must name the session that owns this extension host/)).toHaveCount(0);
    await expect(panel.getByText(/did not answer the RTK resolution request/)).toHaveCount(0);
  });
});
