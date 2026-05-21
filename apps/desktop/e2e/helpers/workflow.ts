import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { launchSeroApp, type LaunchOptions } from './electron-app';
import { layout } from './selectors';
import type { TempSeroHome } from './seroHome';

const APP_CLOSE_TIMEOUT_MS = 5_000;

export interface SeedWorkflowProfileOptions {
  id?: string;
  name?: string;
  profilePath?: string;
  onboarded?: boolean;
}

export interface SeededWorkflowProfile {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  onboarded: boolean;
}

export interface LaunchWorkflowAppOptions extends Omit<LaunchOptions, 'seroHome' | 'env'> {
  home: TempSeroHome;
  env?: Record<string, string>;
  profile?: SeedWorkflowProfileOptions | false;
}

export async function waitForShell(page: Page): Promise<void> {
  await expect(page.locator(layout.appShell).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(layout.sidebarToggle)).toBeVisible({ timeout: 10_000 });
}

export async function openExplorer(page: Page): Promise<void> {
  const opened = await page.evaluate(() => Boolean(window.__appControl?.openApp('explorer')));
  expect(opened).toBe(true);
  await expect(page.locator(layout.activeAppPanel).first()).toBeVisible({ timeout: 10_000 });
}

export function createWorkspaceDir(
  root: string,
  name: string,
  files: Record<string, string> = {},
): string {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
  return dir;
}

export function seedWorkflowProfile(
  home: TempSeroHome,
  options: SeedWorkflowProfileOptions = {},
): SeededWorkflowProfile {
  const id = options.id ?? randomUUID();
  const name = options.name ?? 'Workflow Test';
  const fixedRoot = path.join(home.path, '.sero-ui');
  const profilePath = options.profilePath ?? fixedRoot;
  const createdAt = new Date().toISOString();
  const onboarded = options.onboarded ?? true;

  fs.mkdirSync(path.join(profilePath, 'agent'), { recursive: true });
  fs.mkdirSync(fixedRoot, { recursive: true });
  fs.writeFileSync(
    path.join(fixedRoot, 'profiles.json'),
    JSON.stringify({
      version: 1,
      activeProfileId: id,
      profiles: [{ id, name, path: profilePath, createdAt, onboarded }],
    }, null, 2) + '\n',
    'utf8',
  );

  home.activeProfileId = id;
  return { id, name, path: profilePath, createdAt, onboarded };
}

export async function launchWorkflowApp(
  options: LaunchWorkflowAppOptions,
): Promise<{ app: ElectronApplication; page: Page }> {
  if (options.profile !== false) {
    seedWorkflowProfile(options.home, options.profile);
  }

  return launchSeroApp({
    ...options,
    seroHome: options.home.path,
    env: {
      HOME: options.home.path,
      USERPROFILE: options.home.path,
      SERO_FIXED_ROOT_OVERRIDE: path.join(options.home.path, '.sero-ui'),
      ...options.env,
    },
  });
}

export async function closeApp(app: ElectronApplication | undefined): Promise<void> {
  if (!app) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      app.close(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          app.process().kill();
          resolve();
        }, APP_CLOSE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
