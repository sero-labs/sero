/**
 * App shell rendering workflow tests.
 *
 * Project: workflow. Asserts the main shell, title bar, status
 * bar, and toggle buttons render. Requires a real Electron
 * window — runs only via the workflow project.
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  createTempSeroHome,
  launchWorkflowApp,
  layout,
  type TempSeroHome,
} from './helpers';

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home }));
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    home.cleanup();
  }
});

test.describe('App Shell', () => {
  // UI rendering tests — Electron windows don't reliably render in headless CI.
  // Run locally with test:e2e:local or test:e2e:headed.
  test('should render the main app shell', async () => {
    // The flex container wrapping the entire UI
    await expect(page.locator(layout.appShell).first()).toBeVisible();
  });

  test('should render the title bar', async () => {
    await expect(page.locator(layout.titleBar)).toBeVisible();
  });

  test('should render the status bar', async () => {
    await expect(page.locator(layout.statusBar)).toBeVisible();
  });

  test('should have the sidebar toggle button', async () => {
    await expect(page.locator(layout.sidebarToggle)).toBeVisible();
  });

  test('should have the chat panel toggle button', async () => {
    await expect(page.locator(layout.chatToggle)).toBeVisible();
  });
});
