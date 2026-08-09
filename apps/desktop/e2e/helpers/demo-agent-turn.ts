/**
 * Wait for an agent turn to finish during a demo recording.
 *
 * The chat `Stop` control is rendered only while the focused session streams,
 * so it disappears at every pause between turns, not only at the end of the
 * work. Reading it once is not proof: a run that watched a single hidden
 * reading gave up after 16 seconds while the agent kept building for minutes.
 *
 * This helper needs two things before it calls the turn finished: the control
 * stays hidden for a sustained period, and the work the prompt asked for
 * exists.
 */

import type { Page } from '@playwright/test';
import { chat } from './selectors';

export interface AgentTurnOptions {
  /** The agent must stay idle this long before the turn counts as finished. */
  idleMs?: number;
  /** Proof the requested work exists, e.g. the file the prompt asked for. */
  isComplete?: () => boolean;
  /** Give up after this long in total. */
  timeoutMs?: number;
  /** How long to wait for the turn to start at all. */
  startTimeoutMs?: number;
}

/**
 * Stop waiting once the agent has been idle this long with nothing to show.
 * The agent has given up or failed, so waiting out the full timeout only
 * delays the report.
 */
const ABANDONED_MS = 120_000;

const POLL_MS = 1_000;

export async function waitForAgentTurn(page: Page, options: AgentTurnOptions = {}): Promise<void> {
  const {
    idleMs = 45_000,
    isComplete,
    timeoutMs = 3_000_000,
    startTimeoutMs = 30_000,
  } = options;

  const stop = page.locator(chat.stopButton).first();
  await stop.waitFor({ state: 'visible', timeout: startTimeoutMs }).catch(() => {
    throw new Error(`The agent turn did not start within ${startTimeoutMs}ms.`);
  });

  const deadline = Date.now() + timeoutMs;
  let idleSince: number | null = null;

  while (Date.now() < deadline) {
    const streaming = await stop.isVisible().catch(() => false);
    if (streaming) {
      idleSince = null;
    } else {
      idleSince ??= Date.now();
      const idleFor = Date.now() - idleSince;
      const complete = isComplete?.() ?? true;
      if (idleFor >= idleMs && complete) return;
      if (idleFor >= ABANDONED_MS && !complete) {
        throw new Error(
          `The agent stopped for ${Math.round(idleFor / 1000)}s and the requested work is missing.`,
        );
      }
    }
    await page.waitForTimeout(POLL_MS);
  }

  throw new Error(`The agent turn did not finish within ${timeoutMs}ms.`);
}
