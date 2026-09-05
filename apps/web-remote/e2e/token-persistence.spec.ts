/**
 * A saved pairing has to survive a reload.
 *
 * The token lives in IndexedDB, which every tab on the origin shares.
 * One tab giving up on a pairing the host has forgotten must not take
 * the pairing another tab just made with it.
 */

import { expect, test, type Page } from '@playwright/test';
import { STALE_TOKEN, TEST_TOKEN } from './fixtures/gateway';

async function signIn(page: Page, token: string): Promise<void> {
  const field = page.getByLabel('Auth token');
  await field.waitFor({ state: 'visible' });
  await field.fill(token);
  await page.getByRole('button', { name: 'Connect' }).click();
}

/** Whether a pairing is stored for this origin. */
function storedToken(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const request = indexedDB.open('sero-web-remote');
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('tokens', 'readonly').objectStore('tokens');
          const entry = read.get('gateway-token');
          entry.onsuccess = () => resolve(entry.result !== undefined);
          entry.onerror = () => resolve(false);
        };
        request.onerror = () => resolve(false);
      }),
  );
}

test.use({ viewport: { width: 1440, height: 900 } });

test('keeps the pairing across a reload', async ({ page }) => {
  await page.goto('/');
  await signIn(page, TEST_TOKEN);
  await expect(page.getByText('Align the remote shell').first()).toBeVisible();

  await page.reload();

  await expect(page.getByText('Align the remote shell').first()).toBeVisible();
  await expect(page.getByLabel('Auth token')).toHaveCount(0);
});

test('a tab giving up on an old pairing leaves the new one alone', async ({
  page,
  context,
}) => {
  // A tab left open across a restart. Its pairing is gone from the host
  // and it is still waiting to be told so.
  await page.goto('/');
  await signIn(page, STALE_TOKEN);

  // While it waits, the desktop is paired again and the new pairing is
  // entered in another tab. Both tabs share one IndexedDB.
  const fresh = await context.newPage();
  await fresh.goto('/');
  await signIn(fresh, TEST_TOKEN);
  await expect(fresh.getByText('Align the remote shell').first()).toBeVisible();
  expect(await storedToken(fresh)).toBe(true);

  // Now the old tab is refused. It is giving up on its own token, and
  // the pairing it must not touch is the one just saved.
  await expect(page.getByText('Invalid authentication token')).toBeVisible();

  expect(await storedToken(fresh)).toBe(true);

  await fresh.reload();
  await expect(fresh.getByText('Align the remote shell').first()).toBeVisible();
  await expect(fresh.getByLabel('Auth token')).toHaveCount(0);
});
