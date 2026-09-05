/**
 * Model and thinking selection from the composer.
 *
 * The chip only changes when the host answers, and the answer carries no
 * session id. A unit test cannot see whether the round trip through the
 * socket actually lands on the chip, so this runs the real thing.
 */

import { expect, test, type Page } from '@playwright/test';
import { TEST_TOKEN } from './fixtures/gateway';

async function openSession(page: Page): Promise<void> {
  await page.goto('/');
  const token = page.getByLabel('Auth token');
  await token.waitFor({ state: 'visible' });
  await token.fill(TEST_TOKEN);
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByText('Align the remote shell').first().click();
}

test.use({ viewport: { width: 1440, height: 900 } });

test('shows the session model and switches to another one', async ({ page }) => {
  await openSession(page);

  const chip = page.getByTestId('model-picker');
  await expect(chip).toContainText('Claude Opus 5');
  await expect(chip).toContainText('High');

  await chip.click();
  await expect(page.getByRole('button', { name: 'GPT-5 Mini' })).toBeVisible();

  await page.getByRole('button', { name: 'GPT-5 Mini' }).click();

  // The list closes and the chip follows the host's answer.
  await expect(chip).toContainText('GPT-5 Mini');
  await expect(page.getByRole('button', { name: 'GPT-5 Mini' })).toHaveCount(0);
});

test('searches the list and changes the thinking level', async ({ page }) => {
  await openSession(page);

  const chip = page.getByTestId('model-picker');
  await chip.click();

  await page.getByPlaceholder('Search models...').fill('haiku');
  await expect(page.getByRole('button', { name: 'Claude Haiku 4.5' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'GPT-5 Mini' })).toHaveCount(0);

  await page.getByPlaceholder('Search models...').fill('');
  await page.getByRole('button', { name: 'Low' }).click();

  await expect(chip).toContainText('Low');
});

test('hides provider logos, so no request leaves for models.dev', async ({ page }) => {
  await openSession(page);
  await page.getByTestId('model-picker').click();

  await expect(page.getByRole('button', { name: 'GPT-5 Mini' })).toBeVisible();
  // A phone on the local network may have no route to the internet.
  await expect(page.locator('img[src*="models.dev"]')).toHaveCount(0);
});
