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
import { captureNavigation } from './ux-audit/navigation';
import { openRow, openTab } from './ux-audit/rows';
import { createInventoryCapture } from './helpers/ux-inventory';
import { setSidebar } from './ux-audit/actions';

const ENABLED = process.env.SERO_E2E_UX_AUDIT === '1';
const AUDIT_HOME = process.env.SERO_E2E_AUDIT_HOME ?? '';
/** `inventory` walks the same screens but records controls instead of pixels. */
const MODE = process.env.SERO_E2E_AUDIT_MODE ?? 'screenshot';
const OUT_DIR = process.env.SERO_E2E_AUDIT_OUT ?? path.resolve(__dirname, '..', 'test-results', 'ux-audit');

/**
 * The logical desktop is 1512x982. A window larger than the screen gets
 * clamped and positioned off-screen, which is what silently cut earlier
 * captures, so both passes must fit inside the display with a margin.
 */
const WIDE = 1440;
const NARROW = 1180;
const WIN_HEIGHT = 920;

let app: ElectronApplication;
let page: Page;
let capture: AuditCapture;

async function setWindow(width: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, size) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    win.setBounds({ x: 0, y: 0, width: size, height: 920 });
    return win.getBounds();
  }, width);
  await page.waitForTimeout(900);
  // A window bigger than the screen is silently clamped, so verify rather
  // than assume: a clamped window captures a layout the user never sees.
  const actual = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getBounds());
  expect(actual?.width, `window clamped: asked ${width}, got ${actual?.width}`).toBe(width);
  expect(actual?.height, `window clamped: asked ${WIN_HEIGHT}, got ${actual?.height}`).toBe(WIN_HEIGHT);
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
      //
      // The Rooms runtime is the one exception worth allowing. A Room's Brief,
      // Team and member panels read from disk and render with it off, but the
      // Activity feed, its filters, and the Claims and Work panels are served
      // by the runtime, so with SERO_ROOMS=0 every one of them photographs as
      // "Nothing has happened yet." against records holding up to 99 events.
      // Set SERO_E2E_AUDIT_ROOMS_RUNTIME=1 to capture them for real. It starts
      // no work on its own: a completed or cancelled Room has nothing to
      // resume, and a paused one waits for an explicit Resume that this walk
      // never clicks.
      SERO_ARCHITECT: process.env.SERO_E2E_AUDIT_ARCHITECT_RUNTIME === '1' ? '1' : '0',
      SERO_ROOMS: process.env.SERO_E2E_AUDIT_ROOMS_RUNTIME === '1' ? '1' : '0',
      SERO_GOALS: '0',
    },
  }));

  capture = MODE === 'inventory'
    ? createInventoryCapture(page, path.join(OUT_DIR, 'inventory.json'))
    : createAuditCapture(page, OUT_DIR, path.join(OUT_DIR, 'register.json'));
  await setWindow(WIDE);
  await waitForShell(page);
  // The workspace sidebar is the same tree on every screen and costs about 340
  // of 1440 pixels. The workspaces walk turns it back on, where it is the point.
  await setSidebar(page, false);
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
  // FroggerNeon first: it is the only project in this profile carrying a run
  // journal, so it is the only one whose Run inspector has anything to load.
  for (const project of [PROJECTS[1]!, PROJECTS[0]!, PROJECTS[4]!]) {
    await captureArchitectSubViews(page, capture, project, WIDE);
  }
});

test('orchestrator: every tab, the create flow and the workflow lists', async () => {
  test.setTimeout(1_800_000);
  await captureOrchestratorTabs(page, capture, 'reading-tracker-resilience-01', WIDE);
  // Deep on the first workflow of each workspace only: the nine sub-tabs render
  // the same screen for every workflow, so repeating them four times per
  // workspace produced dozens of frames that differ only in their content.
  for (const workspace of WORKFLOW_WORKSPACES) {
    await captureWorkflowsIn(page, capture, workspace, WIDE, { max: 1, deep: true });
    await captureWorkflowsIn(page, capture, workspace, WIDE, { start: 1, max: 4, deep: false });
  }
});

test('rooms: every Room in the profile, with its tabs, filters and members', async () => {
  test.setTimeout(1_800_000);
  await captureRoomsList(page, capture, 'reading-tracker-resilience-01', 'empty — this workspace has no Rooms', 'empty', WIDE);
  await captureRoomCreate(page, capture, 'reading-tracker-resilience-01', WIDE);
  // Same reasoning as the workflows: the five filters, five tabs, three views
  // and two member tabs are one screen each, not one per Room.
  for (const workspace of ROOM_WORKSPACES) {
    await captureRoomsIn(page, capture, workspace, WIDE, { max: 1, deep: true });
    await captureRoomsIn(page, capture, workspace, WIDE, { start: 1, max: 4, deep: false });
  }
});

test('workspaces: the tree, its menus and cross-app navigation', async () => {
  test.setTimeout(300_000);
  await setSidebar(page, true);
  await captureWorkspaces(page, capture, WIDE);
  await setSidebar(page, false);
});

test('navigation: follow the thread between apps by clicking the real controls', async () => {
  test.setTimeout(300_000);
  await setSidebar(page, true);
  await captureNavigation(page, capture, WIDE, path.join(OUT_DIR, 'navigation.json'));
  await setSidebar(page, false);
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
