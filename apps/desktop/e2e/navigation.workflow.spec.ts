/**
 * One Back returns the user to where they came from (change
 * ux-follow-the-thread).
 *
 * It seeds a throwaway profile from a real one so the pages render real
 * records: one Architect project with a dispatched Workflow, one with a
 * dispatched Room, and the two workspaces that hold them. Nothing runs and
 * nothing is spent — the Architect, Rooms and Goals runtimes are off and every
 * copied Workflow is disabled before launch.
 *
 *   env -u ELECTRON_RUN_AS_NODE SERO_E2E_NAVIGATION=1 \
 *     npx playwright test e2e/navigation.workflow.spec.ts --project=workflow
 *
 * SERO_E2E_NAVIGATION_PROFILE overrides the source profile (default
 * ~/.sero-ui/profiles/seroarchitectdev).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeSeroApp,
  createTempSeroHome,
  launchSeroApp,
  layout as layoutSel,
  seedProfile,
  seedWorkspace,
  waitForShell,
  type TempSeroHome,
} from './helpers';

const ENABLED = process.env.SERO_E2E_NAVIGATION === '1';
const SOURCE_PROFILE = process.env.SERO_E2E_NAVIGATION_PROFILE
  ?? path.join(os.homedir(), '.sero-ui', 'profiles', 'seroarchitectdev');

/** The credential and model files a page needs to render as it does in the app. */
const AGENT_FILES = [
  '.env',
  'auth.json',
  'github-auth.json',
  'models.json',
  'provider-model-defaults.json',
  'gateway-config.json',
  'gateway-token',
] as const;

/** The record fields this fixture reads. */
interface ArchitectRecord {
  id: string;
  name: string;
  workspaceId: string;
  milestones?: Array<{ id: string; dispatch?: { kind: string; id: string; workspaceId?: string } | null }>;
  research?: Array<{ id: string; roomId?: string }>;
}

interface WorkspaceRegistryFile {
  workspaces: Array<{ id: string; path: string }>;
}

interface LoopIndexFile {
  loops?: Array<{ id: string; title?: string; status?: string }> | null;
}

interface Dispatch {
  kind: 'workflow' | 'room';
  id: string;
  /** The Workflow title, read from the copied state; used to prove a Back landed. */
  title?: string;
  workspaceId: string;
  projectId: string;
  projectName: string;
  /** The milestone that dispatched a Workflow; its rail button carries this id. */
  milestoneId: string;
}

let home: TempSeroHome | undefined;
let app: ElectronApplication;
let page: Page;
let workflowDispatch: Dispatch;
let roomDispatch: Dispatch;
const fixtureWorkspaces: string[] = [];

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

/** Copy a file or directory, doing nothing when the source is absent. */
function copyIfPresent(source: string, destination: string): void {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

/** Neutralise every Workflow in a copied state dir, so no tick can fire one. */
function disableWorkflows(stateDir: string): void {
  const indexPath = path.join(stateDir, 'index.json');
  if (!fs.existsSync(indexPath)) return;
  const index = readJson<LoopIndexFile>(indexPath);
  for (const loop of index.loops ?? []) {
    loop.status = 'disabled';
    const loopFile = path.join(stateDir, 'loops', loop.id, 'loop.json');
    if (!fs.existsSync(loopFile)) continue;
    const record = readJson<Record<string, unknown>>(loopFile);
    fs.writeFileSync(loopFile, JSON.stringify({ ...record, status: 'disabled' }, null, 2), 'utf8');
  }
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
}

function loopTitle(stateDir: string, loopId: string): string {
  const index = readJson<LoopIndexFile>(path.join(stateDir, 'index.json'));
  return index.loops?.find((loop) => loop.id === loopId)?.title ?? loopId;
}

/**
 * Seeds the throwaway profile from a real one.
 *
 * The two workspaces the moves need are copied into temp folders, with every
 * Workflow disabled, and registered under the ids the Architect records name.
 * Everything else — credentials included — comes from the source profile.
 */
function seedNavigationFixture(): { workflow: Dispatch; room: Dispatch } {
  const architectDir = path.join(SOURCE_PROFILE, 'apps', 'architect');
  const projectsDir = path.join(architectDir, 'projects');
  if (!fs.existsSync(projectsDir)) {
    throw new Error(`No Architect records at ${projectsDir}; set SERO_E2E_NAVIGATION_PROFILE.`);
  }

  const projects = fs.readdirSync(projectsDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => readJson<ArchitectRecord>(path.join(projectsDir, file)));

  const workflowProject = projects.find((project) => project.workspaceId
    && (project.milestones ?? []).some((milestone) => milestone.dispatch?.kind === 'workflow'));
  // A different project, so the two moves use two different workspaces.
  const roomProject = projects.find((project) => project.id !== workflowProject?.id && project.workspaceId
    && (project.research ?? []).some((run) => run.roomId));
  if (!workflowProject || !roomProject) {
    throw new Error('The source profile has no project with a dispatched Workflow and one with a dispatched Room.');
  }

  const registry = readJson<WorkspaceRegistryFile>(path.join(SOURCE_PROFILE, 'agent', 'workspaces.json'));
  const sourcePath = (id: string) => registry.workspaces.find((workspace) => workspace.id === id)?.path;

  home = createTempSeroHome();
  const profile = seedProfile(home, { id: 'navigation-profile', name: 'Navigation' });
  for (const file of AGENT_FILES) {
    copyIfPresent(
      path.join(SOURCE_PROFILE, 'agent', file),
      path.join(profile.path, 'agent', file),
    );
  }

  /** Copies a workspace's Orchestrator state into a temp folder and registers it. */
  function seedWorkspaceFor(project: ArchitectRecord): string {
    const source = sourcePath(project.workspaceId);
    if (!source) throw new Error(`No workspace "${project.workspaceId}" in the source profile.`);

    const temp = fs.mkdtempSync(path.join(os.tmpdir(), `sero-navigation-${project.workspaceId}-`));
    fixtureWorkspaces.push(temp);
    const state = path.join(temp, '.sero', 'apps', 'orchestrator');
    copyIfPresent(path.join(source, '.sero', 'apps', 'orchestrator'), state);
    copyIfPresent(path.join(source, '.sero-workspace.json'), path.join(temp, '.sero-workspace.json'));
    disableWorkflows(state);
    seedWorkspace(home!, { id: project.workspaceId, name: project.name, path: temp });
    return state;
  }

  const workflowState = seedWorkspaceFor(workflowProject);
  seedWorkspaceFor(roomProject);

  const milestone = (workflowProject.milestones ?? [])
    .find((entry) => entry.dispatch?.kind === 'workflow')!;
  const research = (roomProject.research ?? []).find((run) => run.roomId)!;

  copyIfPresent(architectDir, path.join(profile.path, 'apps', 'architect'));

  return {
    workflow: {
      kind: 'workflow',
      id: milestone.dispatch!.id,
      title: loopTitle(workflowState, milestone.dispatch!.id),
      workspaceId: workflowProject.workspaceId,
      projectId: workflowProject.id,
      projectName: workflowProject.name,
      milestoneId: milestone.id,
    },
    room: {
      kind: 'room',
      id: research.roomId!,
      workspaceId: roomProject.workspaceId,
      projectId: roomProject.id,
      projectName: roomProject.name,
      milestoneId: '',
    },
  };
}

test.describe.configure({ mode: 'serial' });
test.skip(!ENABLED, 'Set SERO_E2E_NAVIGATION=1 to run the navigation workflow spec.');

test.beforeAll(async () => {
  test.setTimeout(180_000);
  const seeded = seedNavigationFixture();
  workflowDispatch = seeded.workflow;
  roomDispatch = seeded.room;

  ({ app, page } = await launchSeroApp({
    seroHome: home!.path,
    runtime: 'host',
    env: {
      // No owner is woken, no Room or Goal resumes, and no Workflow fires.
      SERO_ARCHITECT: '0',
      SERO_ROOMS: '0',
      SERO_GOALS: '0',
    },
  }));

  await waitForShell(page);
  // The sidebar is where the workspace switch happens.
  await expect(page.locator(layoutSel.sidebarPanel)).toBeVisible({ timeout: 15_000 });
});

test.afterAll(async () => {
  await closeSeroApp(app);
  home?.cleanup();
  for (const dir of fixtureWorkspaces) fs.rmSync(dir, { recursive: true, force: true });
});

/** Opens an app with launch params, the way `openSeroApp` does inside the renderer. */
async function openApp(appId: string, params?: Record<string, unknown>, workspaceId?: string): Promise<void> {
  const opened = await page.evaluate(({ appId, params, workspaceId }) => {
    const control = window.__appControl;
    if (!control) return false;
    const registry = (globalThis as Record<string, unknown>).__sero_app_launch_params__ as
      Map<string, Record<string, unknown>> | undefined;
    const launch = registry ?? new Map<string, Record<string, unknown>>();
    (globalThis as Record<string, unknown>).__sero_app_launch_params__ = launch;
    if (params) launch.set(appId, params);
    const result = workspaceId ? control.openApp(appId, workspaceId) : control.openApp(appId);
    if (result && params) {
      window.dispatchEvent(new CustomEvent(`sero:app-launch:${appId}`, { detail: params }));
    }
    return result;
  }, { appId, params, workspaceId });
  expect(opened).toBe(true);
}

const titleBack = () => page.locator(`${layoutSel.titleBar} button[aria-label^="Back"]`).first();
const architectPanel = () => page.locator('[data-app="architect"]').first();
const orchestratorPanel = () => page.locator('[data-app="orchestrator"]').first();

test('Open in Orchestrator then Back once lands on the Architect project', async () => {
  test.setTimeout(120_000);
  await openApp('architect', { projectId: workflowDispatch.projectId });
  await expect(architectPanel()).toContainText(workflowDispatch.projectName, { timeout: 20_000 });

  await page.getByTestId(`open-${workflowDispatch.milestoneId}`).click();
  // The Orchestrator opens on a Workflow. Which page inside it is not what this
  // spec measures: the move under test is the Back that follows.
  await expect(orchestratorPanel()).toBeVisible({ timeout: 30_000 });

  // One Back reaches the project, not the page the Orchestrator last showed.
  await expect(titleBack()).toBeEnabled();
  await titleBack().click();
  await expect(architectPanel()).toContainText(workflowDispatch.projectName, { timeout: 20_000 });
});

test('Open Room then Back once lands on the Architect project', async () => {
  test.setTimeout(120_000);
  await openApp('architect', { projectId: roomDispatch.projectId });
  await expect(architectPanel()).toContainText(roomDispatch.projectName, { timeout: 20_000 });

  await page.locator('button.ar-research-action').first().click();
  await expect(orchestratorPanel()).toBeVisible({ timeout: 30_000 });

  await expect(titleBack()).toBeEnabled();
  await titleBack().click();
  await expect(architectPanel()).toContainText(roomDispatch.projectName, { timeout: 20_000 });
});

test('a sidebar workspace switch then Back once lands on the page left', async () => {
  test.setTimeout(120_000);
  await openApp('orchestrator', { loopId: workflowDispatch.id }, workflowDispatch.workspaceId);
  await expect(orchestratorPanel()).toContainText(workflowDispatch.title!, { timeout: 30_000 });

  // Choose the other workspace in the sidebar. The active app stays open.
  await page.locator(`[data-testid="workspace-node-${roomDispatch.workspaceId}"]`).click();

  // The Back label names the workspace it lands in: the one just left.
  await expect(titleBack()).toBeEnabled();
  expect(await titleBack().getAttribute('aria-label')).toContain(workflowDispatch.projectName);

  // One Back returns to the page the user left in the first workspace.
  await titleBack().click();
  await expect(orchestratorPanel()).toContainText(workflowDispatch.title!, { timeout: 30_000 });
});

test('opening the same app in another workspace records a step', async () => {
  test.setTimeout(120_000);
  await openApp('orchestrator', { loopId: workflowDispatch.id }, workflowDispatch.workspaceId);
  await expect(orchestratorPanel()).toContainText(workflowDispatch.title!, { timeout: 30_000 });

  // The app stays open; only the workspace moves, through app control.
  await openApp('orchestrator', undefined, roomDispatch.workspaceId);

  // One Back returns to the Workflow page the user left.
  await expect(titleBack()).toBeEnabled();
  await titleBack().click();
  await expect(orchestratorPanel()).toContainText(workflowDispatch.title!, { timeout: 30_000 });
});
