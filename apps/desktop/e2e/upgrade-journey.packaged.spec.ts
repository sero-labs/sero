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
});
