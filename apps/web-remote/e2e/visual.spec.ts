/**
 * Visual regression for Sero Remote.
 *
 * Each screen is captured at three widths and in both themes, against
 * fixed gateway data. A failure means the interface moved.
 */

import { expect, test, type Page } from '@playwright/test';
import { TEST_TOKEN } from './fixtures/gateway';

/** The widths the epic named: two desktop, one phone. */
const VIEWPORTS = [
  { name: 'desktop-1100', width: 1100, height: 760 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'mobile-390', width: 390, height: 844 },
] as const;

const THEMES = ['dark', 'light'] as const;

/** Sign in, so every test starts on the shell rather than the token screen. */
async function signIn(page: Page): Promise<void> {
  await page.goto('/');

  const token = page.getByLabel('Auth token');
  await token.waitFor({ state: 'visible' });
  await token.fill(TEST_TOKEN);
  await page.getByRole('button', { name: 'Connect' }).click();

  // The board is the landing view, so its first card is the signal that
  // the shell is up. The status bar is hidden at phone widths.
  await expect(page.getByText('Align the remote shell').first()).toBeVisible();
}

/** Put the app in one theme, whichever it started in. */
async function useTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.evaluate((next) => {
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.documentElement.dataset.theme = next;
  }, theme);
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${viewport.name} ${theme}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test('board', async ({ page }) => {
        await signIn(page);
        await useTheme(page, theme);

        await expect(page).toHaveScreenshot(`board-${viewport.name}-${theme}.png`, {
          fullPage: false,
        });
      });

      test('conversation', async ({ page }) => {
        await signIn(page);
        await useTheme(page, theme);

        // A session card opens the conversation, on every width.
        await page.getByRole('button', { name: /Align the remote shell/ }).first().click();
        await expect(page.getByText('Sidebar parity')).toBeVisible();

        await expect(page).toHaveScreenshot(`chat-${viewport.name}-${theme}.png`);
      });

      test('notifications', async ({ page }) => {
        await signIn(page);
        await useTheme(page, theme);

        await page.getByTestId('notification-bell').click();
        await expect(page.getByText('Stand-up notes are due')).toBeVisible();

        await expect(page).toHaveScreenshot(`notifications-${viewport.name}-${theme}.png`);
      });
    });
  }
}
