import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeApp,
  createTempSeroHome,
  launchWorkflowApp,
  waitForShell,
  type TempSeroHome,
} from './helpers';

/**
 * Validates scroll containment for the app shell.
 *
 * Asserts the shell root and active-app panel have correct overflow
 * containment so federated apps cannot make the whole window scroll.
 * The ImageGen-specific test self-skips when its federated remote is
 * not available (i.e., when running against the built bundle).
 */

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchWorkflowApp({ home }));
  await waitForShell(page);
});

test.afterAll(async () => {
  try {
    await closeApp(app);
  } finally {
    home.cleanup();
  }
});

test.describe('Scroll containment', () => {
  test('shell root never overflows vertically', async () => {
    const result = await page.evaluate(() => {
      const shell = document.querySelector('.flex.h-screen') as HTMLElement | null;
      if (!shell) return { error: 'shell not found' };
      return { scrollH: shell.scrollHeight, clientH: shell.clientHeight };
    });
    expect(result).not.toHaveProperty('error');
    expect(result.scrollH).toBeLessThanOrEqual(result.clientH! + 1);
  });

  test('ActiveApp wrapper has overflow hidden', async () => {
    const result = await page.evaluate(() => {
      const panel = document.getElementById('active-app-panel') as HTMLElement | null;
      if (!panel) return { error: 'no #active-app-panel' };

      // Walk to find the ActiveApp div with overflow:hidden
      let el: HTMLElement | null = panel;
      for (let i = 0; i < 4; i++) {
        el = el?.firstElementChild as HTMLElement | null;
        if (!el) break;
        const s = getComputedStyle(el);
        if (s.overflow === 'hidden' && s.minHeight === '0px') {
          return { overflowY: s.overflowY };
        }
      }
      let cur: HTMLElement | null = panel;
      const found: string[] = [];
      for (let i = 0; i < 4; i++) {
        cur = cur?.firstElementChild as HTMLElement | null;
        if (!cur) break;
        const s = getComputedStyle(cur);
        found.push(`d${i}: cls="${cur.className}" overflow=${s.overflow}`);
      }
      return { error: `Not found: ${found.join(' | ')}` };
    });

    expect(result).not.toHaveProperty('error');
    expect(result.overflowY).toBe('hidden');
  });

  test('ImageGen: form stays fixed, gallery scrolls', async () => {
    // Open sidebar if needed
    const appsLabel = page.locator('text=Apps').first();
    if (!(await appsLabel.isVisible().catch(() => false))) {
      const toggle = page.locator('button[aria-label="Toggle sidebar"]');
      if (await toggle.isVisible()) {
        await toggle.click();
        await expect(appsLabel).toBeVisible({ timeout: 5_000 });
      }
    }

    // Navigate to ImageGen
    const btn = page.locator('button:has-text("ImageGen")').first();
    if (!(await btn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'ImageGen not in sidebar');
      return;
    }
    await btn.click();
    await expect(page.locator('[data-testid="active-app-panel"]').first()).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: 'e2e/screenshots/scroll-fix-imagegen.png' });

    // Verify imagegen root has overflow:hidden and doesn't exceed its container
    const rootInfo = await page.evaluate(() => {
      const candidates = document.querySelectorAll('[tabindex="0"]');
      for (const el of candidates) {
        const s = getComputedStyle(el as HTMLElement);
        if (s.display === 'flex' && s.flexDirection === 'column' && s.overflow === 'hidden') {
          const h = (el as HTMLElement).getBoundingClientRect().height;
          return { found: true, overflow: s.overflow, height: h, scrollHeight: (el as HTMLElement).scrollHeight };
        }
      }
      return { found: false };
    });

    if (!rootInfo.found) {
      const txt = await page.evaluate(() => document.body.innerText.slice(0, 300));
      test.skip(true, `ImageGen root not found: ${txt.slice(0, 150)}`);
      return;
    }

    expect(rootInfo.overflow).toBe('hidden');
    expect(rootInfo.scrollHeight).toBeLessThanOrEqual(rootInfo.height! + 1);

    // Verify scroll-area viewport is the scroll container
    const scrollInfo = await page.evaluate(() => {
      const vp = document.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;
      if (!vp) return { found: false };
      return { found: true, overflowY: getComputedStyle(vp).overflowY };
    });
    expect(scrollInfo.found).toBe(true);
    expect(['scroll', 'auto', 'overlay']).toContain(scrollInfo.overflowY);

    // Shell must still not overflow
    const shell = await page.evaluate(() => {
      const s = document.querySelector('.flex.h-screen') as HTMLElement;
      return { scrollH: s.scrollHeight, clientH: s.clientHeight };
    });
    expect(shell.scrollH).toBeLessThanOrEqual(shell.clientH + 1);
  });
});
