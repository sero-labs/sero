/**
 * The host's Allow cards.
 *
 * A grant card is raised by work that does not start until the card is answered.
 * A single click can report success while the card stays up, and the card's own
 * timeout is a denial, so a test that clicks once and then waits is waiting on
 * a refusal. Pressing every card until it is gone settles that, and counting the
 * presses still fails when a card never showed at all.
 */

import type { Page } from '@playwright/test';

/** The Allow choice: a plain question card numbers it ("1. Allow"), a contextual one does not. */
export const ALLOW = /^(\d+\. )?Allow$/;

/**
 * Presses every Allow card the page shows until `end()` is called, and counts
 * the cards it answered so a caller can prove its card actually showed.
 */
export class AllowCards {
  private stopped = true;
  private stopSignal: Promise<void> = Promise.resolve();
  private stop: () => void = () => undefined;
  count = 0;

  start(page: Page): void {
    this.stopped = false;
    this.count = 0;
    this.stopSignal = new Promise((resolve) => { this.stop = resolve; });
    void this.run(page);
  }

  end(): void {
    this.stopped = true;
    this.stop();
  }

  private async run(page: Page): Promise<void> {
    const button = page.getByRole('button', { name: ALLOW }).first();
    while (!this.stopped) {
      const shown = await Promise.race([
        button.waitFor({ state: 'visible', timeout: 0 }).then(() => true, () => false),
        this.stopSignal.then(() => false),
      ]);
      if (!shown || this.stopped) return;
      const pressed = await button.click({ timeout: 10_000 }).then(() => true, () => false);
      if (pressed) this.count += 1;
      // The card goes away once answered. Waiting for that keeps one card from counting twice.
      await Promise.race([
        button.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => undefined),
        this.stopSignal,
      ]);
    }
  }
}
