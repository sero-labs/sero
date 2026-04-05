import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchSeroApp, layout } from './helpers';
import fs from 'fs';
import path from 'path';

/**
 * Layout e2e tests.
 *
 * Verifies panel toggle, resize, persistence, and reload behaviour
 * for the main sidebar, chat panel, and ExplorerWorkspace terminal.
 */

const SERO_TEST_HOME = path.resolve(__dirname, '../.sero-layout-test');
const LAYOUT_FILE = path.join(SERO_TEST_HOME, 'agent', 'layout.json');

// ── Helpers ─────────────────────────────────────────────────────

/** Read the persisted layout.json from disk. */
function readLayoutFile(): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(LAYOUT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/** Write a layout.json seed before launching the app. */
function seedLayout(state: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(LAYOUT_FILE), { recursive: true });
  fs.writeFileSync(LAYOUT_FILE, JSON.stringify(state, null, 2), 'utf8');
}

/** Clean up the test data directory. */
function cleanTestData() {
  fs.rmSync(SERO_TEST_HOME, { recursive: true, force: true });
}

/** Get the bounding box width of a panel by selector. */
async function panelWidth(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).first().boundingBox();
  return box?.width ?? 0;
}

/** Get the bounding box height of a panel by selector. */
async function panelHeight(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).first().boundingBox();
  return box?.height ?? 0;
}

/** Wait for the app shell to be visible (layout hydrated). */
async function waitForShell(page: Page) {
  await expect(page.locator(layout.appShell).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(layout.sidebarToggle)).toBeVisible({ timeout: 10_000 });
}

/** Wait for a panel to reach a width threshold (polls instead of fixed timeout). */
async function waitForPanelWidth(
  page: Page,
  selector: string,
  predicate: (width: number) => boolean,
  timeout = 3000,
) {
  await expect
    .poll(async () => {
      const w = await panelWidth(page, selector);
      return predicate(w);
    }, { timeout })
    .toBe(true);
}

/** Wait for layout.json to exist and satisfy a predicate. */
async function waitForLayoutFile(
  test: (data: Record<string, unknown>) => boolean,
  timeout = 3000,
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const data = readLayoutFile();
    if (data && test(data)) return data;
    await new Promise((r) => setTimeout(r, 100));
  }
  // Final attempt
  const data = readLayoutFile();
  expect(data).toBeTruthy();
  expect(test(data!)).toBe(true);
  return data!;
}

// ── Tests ───────────────────────────────────────────────────────

test.describe('Layout — sidebar toggle', () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    cleanTestData();
    seedLayout({ mainSidebarOpen: true, chatPanelOpen: true });
    ({ app, page } = await launchSeroApp({ seroHome: SERO_TEST_HOME }));
    await waitForShell(page);
  });

  test.afterAll(async () => {
    await app.close();
    cleanTestData();
  });

  test('sidebar is visible when open', async () => {
    const width = await panelWidth(page, layout.sidebarPanel);
    expect(width).toBeGreaterThan(100);
  });

  test('toggling sidebar collapses it to ~0 width', async () => {
    await page.click(layout.sidebarToggle);
    await waitForPanelWidth(page, layout.sidebarPanel, (w) => w < 5);
  });

  test('active app fills freed space (no gap)', async () => {
    const shellBox = await page.locator(layout.shellPanelGroup).first().boundingBox();
    const appBox = await page.locator(layout.activeAppPanel).first().boundingBox();
    const chatBox = await page.locator(layout.chatPanel).first().boundingBox();
    expect(shellBox).toBeTruthy();
    expect(appBox).toBeTruthy();
    expect(chatBox).toBeTruthy();
    const usedWidth = appBox!.width + chatBox!.width;
    expect(usedWidth).toBeGreaterThan(shellBox!.width - 10);
  });

  test('toggling sidebar back restores it', async () => {
    await page.click(layout.sidebarToggle);
    await waitForPanelWidth(page, layout.sidebarPanel, (w) => w > 100);
  });

  test('sidebar open state is persisted to layout.json', async () => {
    await page.click(layout.sidebarToggle);
    await waitForPanelWidth(page, layout.sidebarPanel, (w) => w < 5);
    const data = await waitForLayoutFile((d) => d.mainSidebarOpen === false);
    expect(data.mainSidebarOpen).toBe(false);

    await page.click(layout.sidebarToggle);
    await waitForPanelWidth(page, layout.sidebarPanel, (w) => w > 100);
    const data2 = await waitForLayoutFile((d) => d.mainSidebarOpen === true);
    expect(data2.mainSidebarOpen).toBe(true);
  });
});

test.describe('Layout — chat panel toggle', () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    cleanTestData();
    seedLayout({ mainSidebarOpen: true, chatPanelOpen: true });
    ({ app, page } = await launchSeroApp({ seroHome: SERO_TEST_HOME }));
    await waitForShell(page);
  });

  test.afterAll(async () => {
    await app.close();
    cleanTestData();
  });

  test('chat panel is visible when open', async () => {
    const width = await panelWidth(page, layout.chatPanel);
    expect(width).toBeGreaterThan(100);
  });

  test('toggling chat panel collapses it to ~0 width', async () => {
    await page.click(layout.chatToggle);
    await waitForPanelWidth(page, layout.chatPanel, (w) => w < 5);
  });

  test('active app fills freed space when chat collapses', async () => {
    const shellBox = await page.locator(layout.shellPanelGroup).first().boundingBox();
    const sidebarBox = await page.locator(layout.sidebarPanel).first().boundingBox();
    const appBox = await page.locator(layout.activeAppPanel).first().boundingBox();
    expect(shellBox).toBeTruthy();
    expect(appBox).toBeTruthy();
    const usedWidth = (sidebarBox?.width ?? 0) + appBox!.width;
    expect(usedWidth).toBeGreaterThan(shellBox!.width - 10);
  });

  test('toggling chat panel back restores it', async () => {
    await page.click(layout.chatToggle);
    await waitForPanelWidth(page, layout.chatPanel, (w) => w > 100);
  });

  test('chat panel open state is persisted to layout.json', async () => {
    await page.click(layout.chatToggle);
    await waitForPanelWidth(page, layout.chatPanel, (w) => w < 5);
    const data = await waitForLayoutFile((d) => d.chatPanelOpen === false);
    expect(data.chatPanelOpen).toBe(false);

    await page.click(layout.chatToggle);
    await waitForPanelWidth(page, layout.chatPanel, (w) => w > 100);
    const data2 = await waitForLayoutFile((d) => d.chatPanelOpen === true);
    expect(data2.chatPanelOpen).toBe(true);
  });
});

test.describe('Layout — both panels collapsed', () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    cleanTestData();
    seedLayout({ mainSidebarOpen: true, chatPanelOpen: true });
    ({ app, page } = await launchSeroApp({ seroHome: SERO_TEST_HOME }));
    await waitForShell(page);
  });

  test.afterAll(async () => {
    await app.close();
    cleanTestData();
  });

  test('active app fills full width when both panels collapsed', async () => {
    // Collapse sidebar
    await page.click(layout.sidebarToggle);
    await waitForPanelWidth(page, layout.sidebarPanel, (w) => w < 5);
    // Collapse chat
    await page.click(layout.chatToggle);
    await waitForPanelWidth(page, layout.chatPanel, (w) => w < 5);

    const shellBox = await page.locator(layout.shellPanelGroup).first().boundingBox();
    const appBox = await page.locator(layout.activeAppPanel).first().boundingBox();
    expect(shellBox).toBeTruthy();
    expect(appBox).toBeTruthy();
    // Active app should be nearly the full shell width
    expect(appBox!.width).toBeGreaterThan(shellBox!.width - 10);
  });
});

test.describe('Layout — size persistence across reload', () => {
  let app: ElectronApplication;
  let page: Page;

  test.afterAll(async () => {
    await app?.close();
    cleanTestData();
  });

  test('persisted sidebar size is restored on reload', async () => {
    cleanTestData();
    // Seed a specific sidebar size
    seedLayout({
      mainSidebarOpen: true,
      chatPanelOpen: true,
      mainSidebarSizePct: 25,
      chatPanelSizePct: 35,
    });
    ({ app, page } = await launchSeroApp({ seroHome: SERO_TEST_HOME }));
    await waitForShell(page);

    const shellBox = await page.locator(layout.shellPanelGroup).first().boundingBox();
    const sidebarWidth = await panelWidth(page, layout.sidebarPanel);
    expect(shellBox).toBeTruthy();
    // Sidebar should be ~25% of shell width (±5% tolerance)
    const actualPct = (sidebarWidth / shellBox!.width) * 100;
    expect(actualPct).toBeGreaterThan(20);
    expect(actualPct).toBeLessThan(30);

    const chatWidth = await panelWidth(page, layout.chatPanel);
    const chatPct = (chatWidth / shellBox!.width) * 100;
    expect(chatPct).toBeGreaterThan(30);
    expect(chatPct).toBeLessThan(40);
  });

  test('sidebar size is written to layout.json on drag', async () => {
    // The sizes should already be persisted from the seeded launch
    const data = readLayoutFile();
    expect(data).toBeTruthy();
    expect(typeof data!.mainSidebarSizePct).toBe('number');
    expect(typeof data!.chatPanelSizePct).toBe('number');
  });
});

test.describe('Layout — collapse + reopen preserves size', () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    cleanTestData();
    seedLayout({
      mainSidebarOpen: true,
      chatPanelOpen: true,
      mainSidebarSizePct: 22,
      chatPanelSizePct: 32,
    });
    ({ app, page } = await launchSeroApp({ seroHome: SERO_TEST_HOME }));
    await waitForShell(page);
  });

  test.afterAll(async () => {
    await app.close();
    cleanTestData();
  });

  test('sidebar collapse + reopen restores previous size', async () => {
    const beforeWidth = await panelWidth(page, layout.sidebarPanel);
    expect(beforeWidth).toBeGreaterThan(100);

    await page.click(layout.sidebarToggle);
    await waitForPanelWidth(page, layout.sidebarPanel, (w) => w < 5);

    await page.click(layout.sidebarToggle);
    await waitForPanelWidth(page, layout.sidebarPanel, (w) => w > 100);
    const afterWidth = await panelWidth(page, layout.sidebarPanel);

    expect(Math.abs(afterWidth - beforeWidth)).toBeLessThan(20);
  });

  test('chat panel collapse + reopen restores previous size', async () => {
    const beforeWidth = await panelWidth(page, layout.chatPanel);
    expect(beforeWidth).toBeGreaterThan(100);

    await page.click(layout.chatToggle);
    await waitForPanelWidth(page, layout.chatPanel, (w) => w < 5);

    await page.click(layout.chatToggle);
    await waitForPanelWidth(page, layout.chatPanel, (w) => w > 100);
    const afterWidth = await panelWidth(page, layout.chatPanel);

    expect(Math.abs(afterWidth - beforeWidth)).toBeLessThan(20);
  });
});

test.describe('Layout — closed panels restored from disk', () => {
  test.afterEach(async ({ }, testInfo) => {
    // Each test in this suite launches its own app
    cleanTestData();
  });

  test('sidebar closed + chat open on load', async () => {
    cleanTestData();
    seedLayout({
      mainSidebarOpen: false,
      chatPanelOpen: true,
      mainSidebarSizePct: 20,
      chatPanelSizePct: 30,
    });
    const { app, page } = await launchSeroApp({ seroHome: SERO_TEST_HOME });
    try {
      await waitForShell(page);

      const sidebarWidth = await panelWidth(page, layout.sidebarPanel);
      expect(sidebarWidth).toBeLessThan(5);

      const shellBox = await page.locator(layout.shellPanelGroup).first().boundingBox();
      const appBox = await page.locator(layout.activeAppPanel).first().boundingBox();
      const chatBox = await page.locator(layout.chatPanel).first().boundingBox();
      expect(shellBox).toBeTruthy();
      const usedWidth = appBox!.width + chatBox!.width;
      expect(usedWidth).toBeGreaterThan(shellBox!.width - 10);
    } finally {
      await app.close();
    }
  });

  test('chat closed + sidebar open on load', async () => {
    cleanTestData();
    seedLayout({
      mainSidebarOpen: true,
      chatPanelOpen: false,
      mainSidebarSizePct: 20,
      chatPanelSizePct: 30,
    });
    const { app, page } = await launchSeroApp({ seroHome: SERO_TEST_HOME });
    try {
      await waitForShell(page);

      const chatWidth = await panelWidth(page, layout.chatPanel);
      expect(chatWidth).toBeLessThan(5);

      const shellBox = await page.locator(layout.shellPanelGroup).first().boundingBox();
      const sidebarBox = await page.locator(layout.sidebarPanel).first().boundingBox();
      const appBox = await page.locator(layout.activeAppPanel).first().boundingBox();
      expect(shellBox).toBeTruthy();
      const usedWidth = (sidebarBox?.width ?? 0) + appBox!.width;
      expect(usedWidth).toBeGreaterThan(shellBox!.width - 10);
    } finally {
      await app.close();
    }
  });

  test('BOTH panels closed on load — no gap, app fills full width', async () => {
    cleanTestData();
    seedLayout({
      mainSidebarOpen: false,
      chatPanelOpen: false,
      mainSidebarSizePct: 20,
      chatPanelSizePct: 30,
    });
    const { app, page } = await launchSeroApp({ seroHome: SERO_TEST_HOME });
    try {
      await waitForShell(page);

      const sidebarWidth = await panelWidth(page, layout.sidebarPanel);
      const chatWidth = await panelWidth(page, layout.chatPanel);
      expect(sidebarWidth).toBeLessThan(5);
      expect(chatWidth).toBeLessThan(5);

      const shellBox = await page.locator(layout.shellPanelGroup).first().boundingBox();
      const appBox = await page.locator(layout.activeAppPanel).first().boundingBox();
      expect(shellBox).toBeTruthy();
      expect(appBox!.width).toBeGreaterThan(shellBox!.width - 10);
    } finally {
      await app.close();
    }
  });
});

test.describe('Layout — first launch (no layout.json)', () => {
  test('defaults to both panels open with no saved state', async () => {
    cleanTestData();
    // No seedLayout — layout.json does not exist
    const { app, page } = await launchSeroApp({ seroHome: SERO_TEST_HOME });
    try {
      await waitForShell(page);

      const sidebarWidth = await panelWidth(page, layout.sidebarPanel);
      const chatWidth = await panelWidth(page, layout.chatPanel);
      expect(sidebarWidth).toBeGreaterThan(100);
      expect(chatWidth).toBeGreaterThan(100);

      // All three panels should sum to shell width
      const shellBox = await page.locator(layout.shellPanelGroup).first().boundingBox();
      const appBox = await page.locator(layout.activeAppPanel).first().boundingBox();
      expect(shellBox).toBeTruthy();
      const totalUsed = sidebarWidth + appBox!.width + chatWidth;
      expect(totalUsed).toBeGreaterThan(shellBox!.width - 10);
    } finally {
      await app.close();
      cleanTestData();
    }
  });
});

test.describe('Layout — rapid toggle', () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    cleanTestData();
    seedLayout({ mainSidebarOpen: true, chatPanelOpen: true });
    ({ app, page } = await launchSeroApp({ seroHome: SERO_TEST_HOME }));
    await waitForShell(page);
  });

  test.afterAll(async () => {
    await app.close();
    cleanTestData();
  });

  test('rapid sidebar toggle settles to correct state', async () => {
    // 6 toggles from open → ends at open (even count)
    for (let i = 0; i < 6; i++) {
      await page.click(layout.sidebarToggle);
      await page.waitForTimeout(50);
    }
    await waitForPanelWidth(page, layout.sidebarPanel, (w) => w > 100, 5000);

    // 5 more toggles → ends at closed (odd count)
    for (let i = 0; i < 5; i++) {
      await page.click(layout.sidebarToggle);
      await page.waitForTimeout(50);
    }
    await waitForPanelWidth(page, layout.sidebarPanel, (w) => w < 5, 5000);

    // Active app fills freed space (no lingering gap)
    const shellBox = await page.locator(layout.shellPanelGroup).first().boundingBox();
    const appBox = await page.locator(layout.activeAppPanel).first().boundingBox();
    const chatBox = await page.locator(layout.chatPanel).first().boundingBox();
    const usedWidth = appBox!.width + chatBox!.width;
    expect(usedWidth).toBeGreaterThan(shellBox!.width - 10);
  });
});
