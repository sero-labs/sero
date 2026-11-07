/**
 * The beta-to-1.0 upgrade journey (issue #635, the blocking half).
 *
 * A 0.9 install had no profile registry: it was `<root>/agent/` and nothing else.
 * `migrateExistingInstall` adopts that into a "Default" profile on first launch.
 * This seeds exactly that pre-1.0 layout — no `profiles.json` — launches the
 * packaged build against it, and asserts the install is adopted rather than
 * treated as fresh, with its memory and app state still there afterwards.
 *
 * Runs the packaged artifact, per §2 of RELEASING.md: a development build is not
 * evidence for an upgrade real users will perform.
 */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, createTempSeroHome, launchSeroApp, waitForShell, type TempSeroHome } from './helpers';import { PACKAGED_SKIP_REASON, findPackagedApp } from './helpers/packaged-app';

const packagedApp = findPackagedApp();
test.skip(!packagedApp, PACKAGED_SKIP_REASON);

const MEMORY_IDENTITY = '# Identity\n\n- **Name:** Sero\n';
const MEMORY_USER = '# User\n\n- **Role:** Developer\n';
const APP_STATE = JSON.stringify({ visited: true, note: 'pre-1.0 state' }, null, 2);
/** A session file in the shape a 0.9 install wrote: a JSONL header, then records. */
const SESSION_ID = '01a19c41-26c6-71c5-8239-566c0504af5d';
const SESSION_NAME = 'Pre-1.0 session';
const SESSION_TEXT = 'hello from the old install';
const SESSION_FILE = `2026-01-02T10-00-00-000Z_${SESSION_ID}.jsonl`;
const WORKSPACE_DIR_NAME = 'old-workspace';
/** An Architect project record: app data a user would be upset to lose. */
const PROJECT_ID = 'proj-pre-1-0';
const PROJECT_RECORD = `${JSON.stringify({ version: 1, title: 'Pre-1.0 project' }, null, 2)}\n`;

/** The record stream for one pre-upgrade session, newest last. */
function legacySessionRecords(workspaceDir: string): string {
  const at = '2026-01-02T10:00:00.000Z';
  return [
    { type: 'session', version: 3, id: SESSION_ID, timestamp: at, cwd: workspaceDir },
    { type: 'session_info', id: 'info-0001', parentId: SESSION_ID, timestamp: at, name: SESSION_NAME },
    {
      type: 'message',
      id: 'msg-0001',
      parentId: 'info-0001',
      timestamp: at,
      message: { role: 'user', content: [{ type: 'text', text: SESSION_TEXT }], timestamp: at },
    },
  ].map((record) => JSON.stringify(record)).join('\n') + '\n';
}

/** What a profile registry looks like, as far as this test reads it. */
interface RegistryFile {
  version: number;
  activeProfileId: string | null;
  profiles: Array<{ id: string; name: string; path: string; onboarded?: boolean }>;
}

let home: TempSeroHome;
let root: string;
let app: ElectronApplication;
let page: Page;

/** A 0.9 install: an agent directory and its data, with no profile registry. */
function seedPreProfileInstall(): void {
  root = path.join(home.path, '.sero-ui');
  fs.mkdirSync(path.join(root, 'agent'), { recursive: true });
  fs.writeFileSync(path.join(root, 'agent', 'auth.json'), '{}\n');
  fs.writeFileSync(
    path.join(root, 'agent', 'settings.json'),
    `${JSON.stringify({ defaultThinkingLevel: 'high', packages: [], sero: { modelTiers: {} } }, null, 2)}\n`,
  );
  fs.mkdirSync(path.join(root, 'workspaces', 'global'), { recursive: true });
  fs.writeFileSync(path.join(root, 'workspaces', 'global', 'IDENTITY.md'), MEMORY_IDENTITY);
  fs.writeFileSync(path.join(root, 'workspaces', 'global', 'USER.md'), MEMORY_USER);
  fs.mkdirSync(path.join(root, 'apps', 'orchestrator'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps', 'orchestrator', 'state.json'), APP_STATE);
  fs.mkdirSync(path.join(root, 'apps', 'architect', 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps', 'architect', 'projects', `${PROJECT_ID}.json`), PROJECT_RECORD);
  // A session the old install recorded, in its own directory.
  const workspaceDir = path.join(home.path, WORKSPACE_DIR_NAME);
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'agent', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'agent', 'sessions', SESSION_FILE), legacySessionRecords(workspaceDir));
}

test.beforeAll(async () => {
  home = createTempSeroHome();
  seedPreProfileInstall();
  // The pre-1.0 install must start with no registry, or this proves nothing.
  expect(fs.existsSync(path.join(root, 'profiles.json'))).toBe(false);
  ({ app, page } = await launchSeroApp({
    executablePath: packagedApp ?? undefined,
    seroHome: root,
    runtime: 'host',
    // `resolveProfileHomeFromRegistry` skips migration whenever SERO_HOME_OVERRIDE
    // is set, which the launcher always sets. Dropping it here is what lets the
    // upgrade path run; the fixed root override keeps it off the real ~/.sero-ui.
    withoutEnv: ['SERO_HOME_OVERRIDE'],
    env: {
      HOME: home.path,
      USERPROFILE: home.path,
      SERO_FIXED_ROOT_OVERRIDE: root,
    },
  }));
});

test.afterAll(async () => {
  if (app) await closeSeroApp(app);
  home?.cleanup();
});

test('adopts a pre-1.0 install instead of showing first-run setup', async () => {
  const registryPath = path.join(root, 'profiles.json');
  expect(fs.existsSync(registryPath), 'no profile registry was written').toBe(true);
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as RegistryFile;

  expect(registry.version).toBe(1);
  expect(registry.profiles).toHaveLength(1);
  expect(registry.profiles[0]?.name).toBe('Default');
  expect(path.resolve(registry.profiles[0]!.path)).toBe(path.resolve(root));
  expect(registry.activeProfileId).toBe(registry.profiles[0]?.id);
  // An existing user has already onboarded; the upgrade must not ask again.
  expect(registry.profiles[0]?.onboarded).toBe(true);
});

test('opens the adopted profile rather than asking which one to use', async () => {
  const view = await page.evaluate(async () => ({
    hasActive: await window.sero.profiles.hasActive(),
    active: await window.sero.profiles.getActive(),
    names: (await window.sero.profiles.list()).map((profile) => profile.name),
  }));
  // The registry is on disk, so the app's own view is what decides the screen.
  expect(view.hasActive, JSON.stringify(view)).toBe(true);
  await waitForShell(await app.firstWindow());
});

test('keeps memory and app state from the old install', async () => {
  expect(fs.readFileSync(path.join(root, 'workspaces', 'global', 'IDENTITY.md'), 'utf8')).toBe(MEMORY_IDENTITY);
  expect(fs.readFileSync(path.join(root, 'workspaces', 'global', 'USER.md'), 'utf8')).toBe(MEMORY_USER);
  expect(fs.readFileSync(path.join(root, 'apps', 'orchestrator', 'state.json'), 'utf8')).toBe(APP_STATE);
  // Projects are app data too. This asserts the record survives the upgrade
  // untouched; that the Architect UI then lists it is not asserted here.
  expect(fs.readFileSync(path.join(root, 'apps', 'architect', 'projects', `${PROJECT_ID}.json`), 'utf8'))
    .toBe(PROJECT_RECORD);
});

test('keeps a session recorded before the upgrade', async () => {
  const sessions = await page.evaluate(() => window.sero.sessions.list());
  const found = sessions.find((session) => session.id === SESSION_ID);
  expect(found, `seeded session missing; listed: ${JSON.stringify(sessions.map((s) => s.id))}`).toBeDefined();
  expect(found?.name).toBe(SESSION_NAME);
  // The record stream parsed, so the history came across rather than just the file.
  expect(found?.messageCount).toBeGreaterThan(0);
});
