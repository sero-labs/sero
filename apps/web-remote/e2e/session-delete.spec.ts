/**
 * Session delete from the sidebar.
 *
 * The row is a button and the delete trigger sits inside it. A unit
 * test cannot see whether the trigger opens its own popover instead of
 * selecting the session, so this runs the real DOM.
 */

import { expect, test, type Page } from '@playwright/test';
import { TEST_TOKEN } from './fixtures/gateway';

async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  const token = page.getByLabel('Auth token');
  await token.waitFor({ state: 'visible' });
  await token.fill(TEST_TOKEN);
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Align the remote shell').first()).toBeVisible();
}

test.use({ viewport: { width: 1440, height: 900 } });

test('asks before it deletes, then removes the row', async ({ page }) => {
  await signIn(page);

  const row = page.getByTestId('session-row').filter({ hasText: 'Gateway token scopes' });
  await expect(row).toBeVisible();

  await row.getByTestId('session-delete').click();

  // The confirm must appear, and the session must still be there.
  await expect(page.getByText('Delete this session?')).toBeVisible();
  await expect(row).toBeVisible();

  await page.getByTestId('session-delete-confirm').click();

  await expect(row).toHaveCount(0);
  // The other session stays.
  await expect(
    page.getByTestId('session-row').filter({ hasText: 'Align the remote shell' }),
  ).toBeVisible();
});

test('leaves the session alone when the confirm is cancelled', async ({ page }) => {
  await signIn(page);

  const row = page.getByTestId('session-row').filter({ hasText: 'Gateway token scopes' });
  await row.getByTestId('session-delete').click();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByText('Delete this session?')).toHaveCount(0);
  await expect(row).toBeVisible();
});
