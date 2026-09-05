/**
 * Dismissing and clearing notifications.
 *
 * Rows disappear on the host's `notifications_dismissed` announcement,
 * never on the response to the request. A unit test cannot see whether
 * that announcement actually reaches the feed, so this runs the real DOM
 * against a gateway that answers and then announces.
 */

import { expect, test, type Page } from '@playwright/test';
import { TEST_TOKEN } from './fixtures/gateway';

async function openFeed(page: Page): Promise<void> {
  await page.goto('/');
  const token = page.getByLabel('Auth token');
  await token.waitFor({ state: 'visible' });
  await token.fill(TEST_TOKEN);
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Align the remote shell').first()).toBeVisible();
  await page.getByTestId('notification-bell').click();
}

test.use({ viewport: { width: 1440, height: 900 } });

test('dismisses one notification and leaves the rest', async ({ page }) => {
  await openFeed(page);

  const rows = page.getByTestId('notification-row');
  const before = await rows.count();
  expect(before).toBeGreaterThan(1);

  await rows.first().getByTestId('notification-dismiss').click();

  await expect(rows).toHaveCount(before - 1);
});

test('clears the read entries and empties the feed', async ({ page }) => {
  await openFeed(page);

  // Opening the feed marks everything read, so Clear read takes the lot.
  const clear = page.getByTestId('notification-clear-read');
  await expect(clear).toBeVisible();
  await clear.click();

  await expect(page.getByTestId('notification-row')).toHaveCount(0);
  await expect(page.getByText('Nothing yet')).toBeVisible();
  // With nothing read left, the action has nothing to offer.
  await expect(clear).toHaveCount(0);
});
