/**
 * Documentation capture for the Workflows guide.
 *
 * This reuses a planned Workflow from the Orchestrator demo profile. It copies
 * the Workflow and theme into disposable test data, then captures display-only
 * interactions. It never generates, revises, enables, or runs the Workflow.
 *
 *   env -u ELECTRON_RUN_AS_NODE SERO_E2E_DOCS_CAPTURE=1 \
 *     npx playwright test e2e/docs-workflows.agent.spec.ts --project=agent
 *
 * Override SERO_E2E_DOCS_WORKSPACE_DIR or SERO_E2E_DOCS_WORKFLOW_TITLE when the
 * local demo fixture moves.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeSeroApp,
  createTempSeroHome,
  launchSeroApp,
  seedProfile,
  seedWorkspace,
  type TempSeroHome,
} from './helpers';
import { waitForShell } from './helpers/workflow';
import { createDocsCapture, escapeRegExp, type DocsCapture } from './helpers/docs-capture';

const ENABLED = process.env.SERO_E2E_DOCS_CAPTURE === '1';
const SOURCE_WORKSPACE = process.env.SERO_E2E_DOCS_WORKSPACE_DIR
  ?? path.join(
    os.homedir(),
    '.sero-ui',
    'profiles',
    'orchestratordemo',
    'workspaces',
    'orchestratorcatalogtest',
  );
const WORKFLOW_TITLE = process.env.SERO_E2E_DOCS_WORKFLOW_TITLE ?? 'Issue implementer';
const THEME_ID = 'danbluetheme';
const THEME_BRAND = '#3cb0e2';
const WORKSPACE_ID = 'orchestratorcatalogtest';
const SHOTS = path.resolve(__dirname, '..', '..', 'docs-site', 'docs', 'assets', 'images');

const REQUIREMENT = [
  'Every two hours and whenever a new issue is opened, review the backlog.',
  'Choose one suitable unassigned issue, claim it safely, and decide whether to ask questions,',
  'write a short plan, or implement it. For an implementation, run the relevant checks and open',
  'a pull request. Handle one issue per run and never merge it.',
].join(' ');

const REFINEMENT = [
  'For security-sensitive issues, pause before implementation and ask me to approve the proposed',
  'approach. Leave the other routes unchanged.',
].join(' ');

interface LoopIndex {
  loops: Array<{ id: string; title: string; status: string }>;
}

let app: ElectronApplication | undefined;
let page: Page;
let capture: DocsCapture;
let home: TempSeroHome | undefined;
let fixtureWorkspace: string | undefined;

const panel = () => capture.panel();
const shot = (name: string) => capture.shot(name);
const toggle = (name: 'Map' | 'Details') => panel().getByRole('radio', { name });

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function copyIfPresent(source: string, destination: string): void {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function seedCaptureFixture(): { seroHome: string; workflowId: string } {
  const sourceState = path.join(SOURCE_WORKSPACE, '.sero', 'apps', 'orchestrator');
  const sourceIndex = path.join(sourceState, 'index.json');
  if (!fs.existsSync(sourceIndex)) {
    throw new Error(`No Orchestrator state at ${sourceState}`);
  }

  const workflow = readJson<LoopIndex>(sourceIndex).loops
    .find((entry) => entry.title.toLowerCase() === WORKFLOW_TITLE.toLowerCase());
  if (!workflow) throw new Error(`No Workflow named "${WORKFLOW_TITLE}" in ${sourceIndex}`);
  if (workflow.status !== 'disabled') {
    throw new Error(`Refusing to capture an enabled Workflow: ${WORKFLOW_TITLE} is ${workflow.status}`);
  }

  const sourceProfile = path.dirname(path.dirname(SOURCE_WORKSPACE));
  const sourceTheme = path.join(sourceProfile, 'themes', `${THEME_ID}.json`);
  if (!fs.existsSync(sourceTheme)) throw new Error(`No ${THEME_ID} theme at ${sourceTheme}`);

  fixtureWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-docs-workflows-'));
  copyIfPresent(sourceState, path.join(fixtureWorkspace, '.sero', 'apps', 'orchestrator'));
  copyIfPresent(
    path.join(SOURCE_WORKSPACE, '.sero-workspace.json'),
    path.join(fixtureWorkspace, '.sero-workspace.json'),
  );

  home = createTempSeroHome();
  const profile = seedProfile(home, { id: 'docs-workflows-profile', name: 'Docs Workflows' });
  seedWorkspace(home, {
    id: WORKSPACE_ID,
    name: 'Orchestrator Catalog Test',
    path: fixtureWorkspace,
  });

  copyIfPresent(sourceTheme, path.join(profile.path, 'themes', `${THEME_ID}.json`));
  for (const appId of ['orchestrator-catalog', 'orchestrator-library']) {
    copyIfPresent(
      path.join(sourceProfile, 'apps', appId),
      path.join(profile.path, 'apps', appId),
    );
  }

  fs.writeFileSync(
    path.join(profile.path, 'agent', 'layout.json'),
    JSON.stringify({
      mainSidebarOpen: false,
      chatPanelOpen: false,
      favouriteApps: ['orchestrator'],
      theme: 'dark',
      activeThemeId: THEME_ID,
      activeWorkspaceId: WORKSPACE_ID,
      activeApp: 'orchestrator',
      appViewIds: {
        orchestrator: { [WORKSPACE_ID]: `workflows/${workflow.id}` },
      },
      appPreferences: {
        orchestrator: { planPresentationMode: 'map' },
      },
      zoomFactor: 1,
    }, null, 2),
    'utf8',
  );

  return { seroHome: home.path, workflowId: workflow.id };
}

async function openWorkflow(): Promise<void> {
  await panel().locator('nav').getByRole('button', { name: /^Workflows(?: \d+)?$/ }).click();
  await panel()
    .getByRole('button', { name: new RegExp(escapeRegExp(WORKFLOW_TITLE)) })
    .first()
    .click();
  await expect(toggle('Map')).toBeVisible({ timeout: 20_000 });
}

async function setStepsPerRow(value: 1 | 2): Promise<void> {
  const slider = panel().getByRole('slider').first();
  await slider.focus();
  await slider.press('Home');
  if (value === 2) await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', String(value));
}

async function expectVerticalOnlyMap(): Promise<void> {
  const metrics = await page.evaluate(() => {
    const node = document.querySelector('[data-app="orchestrator"] button[aria-pressed]');
    const viewport = node?.closest('[class*="overflow-y-auto"]');
    if (!viewport) return null;
    return {
      clientWidth: viewport.clientWidth,
      overflowX: getComputedStyle(viewport).overflowX,
      scrollWidth: viewport.scrollWidth,
    };
  });
  expect(metrics).not.toBeNull();
  expect(metrics!.overflowX).toBe('hidden');
  expect(metrics!.scrollWidth - metrics!.clientWidth).toBeLessThanOrEqual(1);
}

test.describe.configure({ mode: 'serial' });
test.skip(!ENABLED, 'Set SERO_E2E_DOCS_CAPTURE=1 to capture the Workflows guide images.');

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fs.mkdirSync(SHOTS, { recursive: true });
  const fixture = seedCaptureFixture();

  ({ app, page } = await launchSeroApp({ seroHome: fixture.seroHome, runtime: 'host' }));
  await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    win.setBounds({ x: 0, y: 0, width: Math.min(width, 2400), height: Math.min(height, 1500) });
  });

  capture = createDocsCapture(page, SHOTS);
  await waitForShell(page);
  const opened = await page.evaluate(() => Boolean(window.__appControl?.openApp('orchestrator')));
  expect(opened).toBe(true);
  await expect(panel()).toBeVisible({ timeout: 20_000 });

  await expect.poll(async () => page.evaluate(async () => {
    const layout = await window.sero.layout.load();
    return {
      activeThemeId: layout?.activeThemeId,
      brandPrimary: getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim(),
      theme: layout?.theme,
    };
  })).toEqual({ activeThemeId: THEME_ID, brandPrimary: THEME_BRAND, theme: 'dark' });

  await openWorkflow();
  await expect(panel().getByText('Disabled', { exact: true }).first()).toBeVisible();
});

test.afterAll(async () => {
  if (app) await closeSeroApp(app);
  home?.cleanup();
  if (fixtureWorkspace) fs.rmSync(fixtureWorkspace, { recursive: true, force: true });
});

test('captures a dynamic Workflow without running it', async () => {
  test.setTimeout(300_000);

  await panel().getByRole('button', { name: 'New', exact: true }).click();
  await panel().getByPlaceholder(/Every 10 minutes/).fill(REQUIREMENT);
  const title = panel().getByPlaceholder(/Leave blank/);
  if (await title.isVisible()) await title.fill('Issue implementer');
  await shot('orchestrator-issues-describe');

  await openWorkflow();
  await toggle('Map').click();
  await setStepsPerRow(2);
  await expectVerticalOnlyMap();
  await shot('orchestrator-plan-map-branches');

  await setStepsPerRow(1);
  await expectVerticalOnlyMap();
  await shot('orchestrator-plan-map-single-column');

  await setStepsPerRow(2);
  const firstStep = panel().locator('button[aria-pressed]').first();
  await firstStep.click();
  const selectedDetail = panel().getByText(/Review any open pull requests listed in the run context/).last();
  await selectedDetail.scrollIntoViewIfNeeded();
  await shot('orchestrator-plan-map-selected');

  await toggle('Details').click();
  await capture.scrollToTop();
  await shot('orchestrator-issues-complete');
  await page.evaluate(() => {
    document
      .querySelectorAll('[data-app="orchestrator"] [class*="overflow-auto"], [data-app="orchestrator"] [class*="overflow-y-auto"]')
      .forEach((element) => { element.scrollTop = 480; });
  });
  await shot('orchestrator-plan-details');

  await toggle('Map').click();
  const refine = panel().getByPlaceholder(/Update the plan/);
  await refine.fill(REFINEMENT);
  await panel().getByRole('button', { name: 'Update plan' }).scrollIntoViewIfNeeded();
  await shot('orchestrator-refine');

  await panel().locator('nav').getByRole('button', { name: /^Home(?: \d+)?$/ }).click();
  await shot('orchestrator-home-overview');
});
