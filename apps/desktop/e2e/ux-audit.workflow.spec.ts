/**
 * UX audit capture — Architect, Orchestrator, Rooms and Workspaces.
 *
 * Photographs the shipped UI against a copy of a real profile so a design
 * review has evidence instead of recollection. It starts no agent and spends no
 * money: the three app runtimes are killed before launch, so every page renders
 * the recorded state read from files through the host's app-state bridge.
 *
 *   env -u ELECTRON_RUN_AS_NODE \
 *     SERO_E2E_UX_AUDIT=1 \
 *     SERO_E2E_AUDIT_HOME=/path/to/audit-home \
 *     SERO_E2E_AUDIT_OUT=/path/to/shots \
 *     npx playwright test e2e/ux-audit.workflow.spec.ts --project=workflow
 *
 * `SERO_E2E_AUDIT_HOME` must be a copy. The capture opens real workspace
 * folders read-only, but a stray click in a live home would still act on the
 * user's own projects.
 */

import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp, layout as layoutSel } from './helpers';
import { waitForShell } from './helpers/workflow';
import { createAuditCapture, openApp, type AuditCapture } from './helpers/ux-audit';
import { reducedMotion, stillFrames } from './ux-audit/actions';
import { captureArchitectList, captureArchitectProject, captureArchitectSubViews, PROJECTS } from './ux-audit/architect';
import { captureOrchestratorTabs, captureWorkflowsIn, WORKFLOW_WORKSPACES } from './ux-audit/orchestrator';
import { captureRoomCreate, captureRoomsIn, captureRoomsList, ROOM_WORKSPACES } from './ux-audit/rooms';
import { captureWorkspaces } from './ux-audit/workspaces';
import { openRow, openTab } from './ux-audit/rows';

const ENABLED = process.env.SERO_E2E_UX_AUDIT === '1';
const AUDIT_HOME = process.env.SERO_E2E_AUDIT_HOME ?? '';
const OUT_DIR = process.env.SERO_E2E_AUDIT_OUT ?? path.resolve(__dirname, '..', 'test-results', 'ux-audit');

/** Wide enough for the two-column Architect page; the narrow pass checks where it folds. */
const WIDE = 1600;
const NARROW = 1180;

let app: ElectronApplication;
let page: Page;
let capture: AuditCapture;

async function setWindow(width: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, size) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    win.setBounds({ x: 0, y: 0, width: size, height: 1000 });
  }, width);
  await page.waitForTimeout(900);
}

test.describe.configure({ mode: 'serial' });
test.skip(!ENABLED, 'Set SERO_E2E_UX_AUDIT=1 and SERO_E2E_AUDIT_HOME to capture the UX audit.');

test.beforeAll(async () => {
  test.setTimeout(180_000);
  expect(AUDIT_HOME, 'SERO_E2E_AUDIT_HOME must point at a copied profile home').toBeTruthy();

  ({ app, page } = await launchSeroApp({
    seroHome: AUDIT_HOME,
    runtime: 'host',
    env: {
      // No owner is woken, no Room or Goal runtime starts, nothing is written.
      SERO_ARCHITECT: '0',
      SERO_ROOMS: '0',
      SERO_GOALS: '0',
    },
  }));

  capture = createAuditCapture(page, OUT_DIR, path.join(OUT_DIR, 'register.json'));
  await setWindow(WIDE);
  await waitForShell(page);
  await stillFrames(page);
  await expect(page.locator(layoutSel.appShell).first()).toBeVisible();
});

test.afterAll(async () => {
  capture?.write();
  await closeSeroApp(app);
});

test('architect: list, nine projects, disclosures, menus and sub-views', async () => {
  test.setTimeout(1_500_000);
  await captureArchitectList(page, capture, WIDE);
  for (const project of PROJECTS) {
    await captureArchitectProject(page, capture, project, WIDE, { deep: true });
  }
  for (const project of [PROJECTS[0]!, PROJECTS[2]!, PROJECTS[4]!]) {
    await captureArchitectSubViews(page, capture, project, WIDE);
  }
});

test('orchestrator: every tab, the create flow and the workflow lists', async () => {
  test.setTimeout(1_800_000);
  await captureOrchestratorTabs(page, capture, 'reading-tracker-resilience-01', WIDE);
  for (const workspace of WORKFLOW_WORKSPACES) {
    await captureWorkflowsIn(page, capture, workspace, WIDE, { max: 4, deep: true });
  }
});

test('rooms: every Room in the profile, with its tabs, filters and members', async () => {
  test.setTimeout(1_800_000);
  await captureRoomsList(page, capture, 'reading-tracker-resilience-01', 'empty — this workspace has no Rooms', 'empty', WIDE);
  await captureRoomCreate(page, capture, 'reading-tracker-resilience-01', WIDE);
  for (const workspace of ROOM_WORKSPACES) {
    await captureRoomsIn(page, capture, workspace, WIDE, { max: 4, deep: true });
  }
});

test('workspaces: the tree, its menus and cross-app navigation', async () => {
  test.setTimeout(300_000);
  await captureWorkspaces(page, capture, WIDE);
});

test('narrow desktop: the same pages where the layout changes', async () => {
  test.setTimeout(900_000);
  await setWindow(NARROW);
  await captureArchitectList(page, capture, NARROW);
  for (const project of PROJECTS.slice(0, 4)) {
    await captureArchitectProject(page, capture, project, NARROW, { deep: false });
  }
  await captureOrchestratorTabs(page, capture, 'reading-tracker-resilience-01', NARROW);
  await captureWorkflowsIn(page, capture, WORKFLOW_WORKSPACES[0]!, NARROW, { max: 1, deep: false });
  await captureRoomsIn(page, capture, ROOM_WORKSPACES[0]!, NARROW, { max: 2, deep: false });
  await captureWorkspaces(page, capture, NARROW);
});

test('reduced motion: the states that lean on animation', async () => {
  test.setTimeout(300_000);
  await setWindow(WIDE);
  await reducedMotion(page, true);
  for (const project of [PROJECTS[1]!, PROJECTS[0]!, PROJECTS[7]!]) {
    await openApp(page, 'architect', { projectId: project.id });
    await page.waitForTimeout(1_500);
    await capture.shot({
      id: `reduced-motion-architect-${project.slug}`,
      area: 'architect',
      page: `Project — ${project.name}`,
      state: `${project.state} — prefers-reduced-motion`,
      task: 'Understand the state without animation',
      width: WIDE,
    });
  }
  const rooms = await openTab(page, 'csv-summary-resilience-01', 'Rooms');
  if (rooms > 0) {
    const heading = await openRow(page, 0);
    await capture.shot({
      id: 'reduced-motion-room-paused',
      area: 'rooms',
      page: `Room — ${heading ?? 'first row'}`,
      state: 'paused, members waiting — prefers-reduced-motion',
      task: 'Understand who is waiting without animation',
      width: WIDE,
    });
  } else {
    capture.gap(
      { id: 'reduced-motion-room-paused', area: 'rooms', page: 'Room', state: 'prefers-reduced-motion', task: 'Understand who is waiting', width: WIDE },
      'The Rooms list did not open under reduced motion.',
    );
  }
  await reducedMotion(page, false);
});
