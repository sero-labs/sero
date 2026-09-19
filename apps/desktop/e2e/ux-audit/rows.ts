/**
 * List navigation for the Orchestrator.
 *
 * Its launch params are overridden by the route the plugin restores from its
 * own state, so a deep link lands on whatever was open last. Clicking the row
 * always lands on the row that was clicked, and reading the title back proves
 * which one it was.
 */

import type { Page } from '@playwright/test';
import { openApp } from '../helpers/ux-audit';
import { clickIfPresent } from './actions';

/** Rows of the current list: panel buttons carrying a real summary, not chrome. */
export function listRows(page: Page) {
  return page.locator('[data-app-panel] button').filter({ hasText: /.{45,}/ });
}

/** Open one Orchestrator tab in one workspace, and report how many rows it has. */
export async function openTab(page: Page, workspaceId: string, tab: string): Promise<number> {
  await openApp(page, 'orchestrator', undefined, workspaceId);
  await page.waitForTimeout(2_000);
  const control = page.getByRole('button', { name: new RegExp(`^${tab}(\\s*\\d+)?$`) }).first();
  if (!(await clickIfPresent(page, control))) return -1;
  await page.waitForTimeout(1_600);
  return listRows(page).count();
}

/** Click the nth row and return the heading it opened, or null when nothing opened. */
export async function openRow(page: Page, index: number): Promise<string | null> {
  const row = listRows(page).nth(index);
  if (!(await clickIfPresent(page, row))) return null;
  await page.waitForTimeout(2_200);
  const heading = page.locator('[data-app-panel] h1, [data-app-panel] h2, [data-app-panel] h3').first();
  const text = await heading.innerText().catch(() => '');
  return text.replace(/\s+/g, ' ').trim() || null;
}

/** A file-name-safe stem from a heading. */
export function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 44);
  return slug || fallback;
}
