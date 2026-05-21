import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp } from './helpers/electron-app';
import { createTempSeroHome, type TempSeroHome } from './helpers/seroHome';

test.describe.configure({ mode: 'serial' });

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;
let activeProfileId: string;

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchSeroApp({
    seroHome: home.path,
    runtime: 'host',
    mockRelaunch: true,
    env: {
      HOME: home.path,
      USERPROFILE: home.path,
    },
  }));
});

test.afterAll(async () => {
  try {
    await closeApp();
  } finally {
    home.cleanup();
  }
});

async function closeApp(): Promise<void> {
  await closeSeroApp(app);
}

test.describe('profiles and onboarding IPC contracts', () => {
  test('creates, lists, renames, and deletes an inactive profile', async () => {
    const initial = await page.evaluate(async () => {
      const [profiles, active, hasActive] = await Promise.all([
        window.sero.profiles.list(),
        window.sero.profiles.getActive(),
        window.sero.profiles.hasActive(),
      ]);
      return { profiles, active, hasActive };
    });

    expect(initial.profiles).toEqual([]);
    expect(initial.active).toBeNull();
    expect(initial.hasActive).toBe(false);

    const created = await page.evaluate(() => window.sero.profiles.create('Contract Active'));
    activeProfileId = created.id;

    expect(created).toEqual(expect.objectContaining({
      id: expect.any(String),
      name: 'Contract Active',
      path: expect.any(String),
      createdAt: expect.any(String),
      isActive: true,
    }));

    const inactive = await page.evaluate(() => window.sero.profiles.create('Contract Inactive'));
    expect(inactive).toEqual(expect.objectContaining({
      id: expect.any(String),
      name: 'Contract Inactive',
      path: expect.any(String),
      createdAt: expect.any(String),
      isActive: false,
    }));

    await page.evaluate(
      (id) => window.sero.profiles.rename(id, 'Renamed Contract Inactive'),
      inactive.id,
    );

    const afterRename = await page.evaluate(() => window.sero.profiles.list());
    expect(afterRename).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: activeProfileId, name: 'Contract Active', isActive: true }),
      expect.objectContaining({ id: inactive.id, name: 'Renamed Contract Inactive', isActive: false }),
    ]));
    expect(afterRename.every((profile) => typeof profile.path === 'string')).toBe(true);

    await page.evaluate((id) => window.sero.profiles.delete(id), inactive.id);

    const afterDelete = await page.evaluate(() => window.sero.profiles.list());
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: activeProfileId, name: 'Contract Active', isActive: true }),
    ]));
    expect(afterDelete.some((profile) => profile.id === inactive.id)).toBe(false);
  });

  test('reports onboarding state and marks the active profile onboarded', async () => {
    expect(activeProfileId).toEqual(expect.any(String));

    const before = await page.evaluate(async () => {
      const [needsOnboarding, state] = await Promise.all([
        window.sero.profiles.needsOnboarding(),
        window.sero.onboarding.getState(),
      ]);
      return { needsOnboarding, state };
    });

    expect(before.needsOnboarding).toBe(true);
    expect(before.state).toEqual(expect.objectContaining({
      needed: true,
      phase: expect.any(String),
      hasAnyUsableModels: expect.any(Boolean),
      hasImportedCredentials: expect.any(Boolean),
      memoryBootstrapComplete: expect.any(Boolean),
      providerHealth: expect.any(Array),
      availableModelGroups: expect.any(Array),
      warnings: expect.any(Array),
      invalidTiers: expect.any(Array),
      containerRuntime: expect.objectContaining({
        status: expect.any(String),
        message: expect.any(String),
        recommended: expect.any(Boolean),
      }),
    }));

    await page.evaluate(() => window.sero.profiles.markOnboardingDone());

    const after = await page.evaluate(async () => {
      const [needsOnboarding, active, state] = await Promise.all([
        window.sero.profiles.needsOnboarding(),
        window.sero.profiles.getActive(),
        window.sero.onboarding.getState(),
      ]);
      return { needsOnboarding, active, state };
    });

    expect(after.needsOnboarding).toBe(false);
    expect(after.active).toEqual(expect.objectContaining({
      id: activeProfileId,
      onboarded: true,
      isActive: true,
    }));
    expect(after.state).toEqual(expect.objectContaining({
      needed: false,
      phase: 'done',
      providerHealth: expect.any(Array),
      availableModelGroups: expect.any(Array),
      containerRuntime: expect.objectContaining({
        status: expect.any(String),
        message: expect.any(String),
        recommended: expect.any(Boolean),
      }),
    }));
  });
});
