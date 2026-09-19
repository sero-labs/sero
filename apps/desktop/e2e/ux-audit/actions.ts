/** Small, failure-tolerant page actions shared by the audit walkers. */

import type { Locator, Page } from '@playwright/test';

/** The app panel's own scroller — the window itself does not scroll. */
async function scrollers(page: Page): Promise<number> {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-app-panel]');
    if (!panel) return 0;
    const nodes = [panel, ...panel.querySelectorAll('*')].filter((node) => {
      const element = node as HTMLElement;
      return element.scrollHeight > element.clientHeight + 40;
    });
    (window as unknown as { __auditScrollers?: Element[] }).__auditScrollers = nodes;
    return nodes.length;
  });
}

export async function panelScrollTo(page: Page, top: number): Promise<void> {
  await scrollers(page);
  await page.evaluate((value) => {
    const nodes = (window as unknown as { __auditScrollers?: Element[] }).__auditScrollers ?? [];
    // The tallest scroller is the page body; the small ones are inner lists.
    const main = [...nodes].sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (main) main.scrollTop = value;
  }, top);
  await page.waitForTimeout(450);
}

export async function panelScrollBottom(page: Page): Promise<void> {
  await panelScrollTo(page, 1_000_000);
}

/** Dismiss whatever overlay is open, without failing when none is. */
export async function closeOverlay(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(400);
}

/**
 * Click a control by its visible label, whatever element it is.
 *
 * The Orchestrator mixes buttons, tabs and toggles: the Room detail's "Brief"
 * is a tab while its "Timeline" is a button, and a role-only locator silently
 * misses half of them. This matches the label first and the role second.
 */
export async function clickByLabel(page: Page, label: string): Promise<boolean> {
  const exact = new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
  const candidates = [
    page.locator('[data-app-panel] button, [data-app-panel] [role="tab"], [data-app-panel] summary').filter({ hasText: exact }).first(),
    page.getByRole('tab', { name: label, exact: true }).first(),
    page.getByRole('button', { name: label, exact: true }).first(),
  ];
  for (const candidate of candidates) {
    if (await clickIfPresent(page, candidate)) return true;
  }
  return false;
}

export async function clickIfPresent(page: Page, locator: Locator): Promise<boolean> {
  try {
    if (!(await locator.isVisible({ timeout: 2_000 }))) return false;
    await locator.click({ timeout: 4_000 });
    return true;
  } catch {
    return false;
  }
}

/** Expand every `<details>` in the panel. Returns how many were closed before. */
export async function openSummaries(page: Page): Promise<number> {
  const opened = await page.evaluate(() => {
    const panel = document.querySelector('[data-app-panel]');
    if (!panel) return 0;
    const closed = [...panel.querySelectorAll('details')].filter((node) => !node.open);
    closed.forEach((node) => { node.open = true; });
    return closed.length;
  });
  await page.waitForTimeout(600);
  return opened;
}

/** Turn animation off for the whole window, so a capture is not caught mid-transition. */
export async function stillFrames(page: Page): Promise<void> {
  await page.addStyleTag({
    content: '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important}',
  }).catch(() => undefined);
}

/** Emulate the reduced-motion preference, so the audit can check what is left. */
export async function reducedMotion(page: Page, on: boolean): Promise<void> {
  await page.emulateMedia({ reducedMotion: on ? 'reduce' : 'no-preference' }).catch(() => undefined);
  await page.waitForTimeout(400);
}
