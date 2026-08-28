/**
 * Screenshot helpers for the documentation capture specs.
 *
 * Two crops, for two jobs. `shot` frames the whole Orchestrator panel, which is
 * what a walkthrough step needs. `shotPlan` crops to the plan map itself,
 * because a panel-width picture of a map is unreadable once the docs site
 * scales it into a ~750px content column.
 */

import path from 'node:path';
import type { Page } from '@playwright/test';

export interface DocsCapture {
  /** The `data-app` node — a `display: contents` wrapper, so query-only. */
  panel: () => ReturnType<Page['locator']>;
  shot: (name: string) => Promise<void>;
  shotPlan: (name: string, options?: { withToolbar?: boolean; wholeCard?: boolean }) => Promise<void>;
  shotElement: (name: string, locator: ReturnType<Page['locator']>) => Promise<void>;
  shotAbove: (name: string, marker: string, from?: ReturnType<Page['locator']>) => Promise<void>;
  scrollToTop: () => Promise<void>;
}

export function createDocsCapture(page: Page, shotsDir: string): DocsCapture {
  const panel = () => page.locator('[data-app="orchestrator"]').first();
  /** The wrapper has no box of its own; its first element child fills the window. */
  const panelFrame = () => page.locator('[data-app="orchestrator"] > *').first();

  async function shot(name: string): Promise<void> {
    await page.waitForTimeout(400);
    const box = await panelFrame().boundingBox();
    if (!box) throw new Error(`the Orchestrator panel had no box when capturing ${name}`);
    const chromeTop = await page.evaluate(
      () => document.querySelector('footer.chrome-zoom-invariant')?.getBoundingClientRect().top ?? window.innerHeight,
    );
    await page.screenshot({
      path: path.join(shotsDir, `${name}.jpg`),
      quality: 92,
      clip: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: Math.floor(Math.min(box.y + box.height, chromeTop - 2) - box.y),
      },
    });
  }

  async function shotPlan(name: string, { withToolbar = true, wholeCard = false } = {}): Promise<void> {
    await page.waitForTimeout(400);

    // Measured in the page: the node union says where the plan is, the scroll
    // viewport says how much of it is on screen, and the card says where the
    // toolbar starts. Clipping to the union alone spills past the map.
    const region = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('[data-app="orchestrator"] button[aria-pressed]'));
      if (nodes.length === 0) return null;
      const viewport = nodes[0].closest('[class*="overflow-auto"], [class*="overflow-y-auto"]');
      const card = viewport?.parentElement;
      if (!viewport || !card) return null;
      const rects = nodes.map((node) => node.getBoundingClientRect());
      // The shell's status bar carries the workspace path. It must never be in
      // frame, and clamping to the scroll viewport alone did not keep it out:
      // the nearest `overflow-auto` ancestor is sometimes the page, whose bottom
      // is the window bottom.
      const statusBar = document.querySelector('footer.chrome-zoom-invariant')?.getBoundingClientRect();
      return {
        chromeTop: statusBar ? statusBar.top : window.innerHeight,
        nodes: {
          left: Math.min(...rects.map((r) => r.left)),
          right: Math.max(...rects.map((r) => r.right)),
          top: Math.min(...rects.map((r) => r.top)),
          bottom: Math.max(...rects.map((r) => r.bottom)),
        },
        viewport: viewport.getBoundingClientRect().toJSON(),
        card: card.getBoundingClientRect().toJSON(),
      };
    });
    if (!region) throw new Error(`no plan nodes on screen for ${name}`);

    // Room on the right for the feedback edge, which loops outside the node
    // boxes. The inset keeps sub-pixel rounding from reaching past the scroll
    // viewport — one pixel of overshoot at the bottom picks up the workspace
    // path in the status bar, which must never appear in a published image.
    const pad = 40;
    const inset = 4;
    // `wholeCard` keeps everything the card holds — toolbar, map, and the detail
    // strip a selected node opens underneath it — instead of cropping to the
    // nodes. Anything narrower cuts the strip that gives the shot its point.
    const left = wholeCard
      ? Math.ceil(region.card.left + inset)
      : Math.ceil(Math.max(region.card.left, region.nodes.left - pad) + inset);
    const right = wholeCard
      ? Math.floor(region.card.right - inset)
      : Math.floor(Math.min(region.card.right, region.nodes.right + pad) - inset);
    const top = Math.ceil(
      (withToolbar || wholeCard ? region.card.top : Math.max(region.viewport.top, region.nodes.top - pad)) + inset,
    );
    const bottom = Math.floor(
      Math.min(
        region.chromeTop,
        wholeCard
          ? region.card.bottom
          : Math.min(region.viewport.bottom, region.card.bottom, region.nodes.bottom + pad),
      ) - inset,
    );

    await page.screenshot({
      path: path.join(shotsDir, `${name}.jpg`),
      quality: 92,
      clip: { x: left, y: top, width: right - left, height: bottom - top },
    });
  }

  /**
   * Captures one element, scrolled into view first.
   *
   * A panel-wide shot only shows a card that happens to be inside the current
   * scroll position: the first attempt at the approval gate photographed the
   * plan spine, because the question card was above the fold. Scrolling to the
   * subject and cropping to it makes the picture about the thing named.
   */
  async function shotElement(name: string, locator: ReturnType<Page['locator']>): Promise<void> {
    await locator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const box = await locator.boundingBox();
    if (!box) throw new Error(`nothing to capture for ${name}`);

    const pad = 20;
    // The shell's status bar carries the workspace path. A pane that fills the
    // window ends level with it, so the padded clip reaches into it.
    const chromeTop = await page.evaluate(
      () => document.querySelector('footer.chrome-zoom-invariant')?.getBoundingClientRect().top ?? window.innerHeight,
    );
    const top = Math.max(0, box.y - pad);
    const bottom = Math.min(chromeTop - 2, box.y + box.height + pad);
    await page.screenshot({
      path: path.join(shotsDir, `${name}.jpg`),
      quality: 92,
      clip: { x: Math.max(0, box.x - pad), y: top, width: box.width + pad * 2, height: bottom - top },
    });
  }

  /**
   * Puts every scroller in the panel back to the top.
   *
   * A panel shot frames whatever the view is scrolled to. The finished-run
   * picture was taken wherever the last running step had dragged the plan, so it
   * showed the middle of the step list instead of the result.
   */
  async function scrollToTop(): Promise<void> {
    await page.evaluate(() => {
      document
        .querySelectorAll('[data-app="orchestrator"] [class*="overflow-auto"], [data-app="orchestrator"] [class*="overflow-y-auto"]')
        .forEach((element) => { element.scrollTop = 0; });
    });
    await page.waitForTimeout(300);
  }

  /**
   * The panel, cut off above the first element whose text starts with `marker`.
   *
   * There is one screen worth publishing that also carries something that must
   * never be published: a member's Info tab explains its mandate and its budget,
   * and puts the absolute path of its worktree beside them. Rather than drop the
   * picture or edit the file by hand, the shot stops above the offending card.
   */
  async function shotAbove(name: string, marker: string, from?: ReturnType<Page['locator']>): Promise<void> {
    await page.waitForTimeout(400);
    const frame = await (from ?? panelFrame()).boundingBox();
    if (!frame) throw new Error(`nothing to capture for ${name}`);

    // Case-insensitive: these labels are lower case in the DOM and upper case
    // only through `text-transform`, so matching what is on screen finds
    // nothing and the crop never happens.
    const cut = await page.evaluate((text) => {
      const wanted = text.toLowerCase();
      const match = [...document.querySelectorAll('[data-app="orchestrator"] *')]
        .find((element) => element.textContent?.trim().toLowerCase().startsWith(wanted));
      return match ? match.getBoundingClientRect().top : null;
    }, marker);
    if (cut === null) throw new Error(`nothing on screen starts with "${marker}" for ${name}`);

    const height = Math.floor(cut - frame.y - 12);
    if (height < 100) throw new Error(`"${marker}" is too near the top to crop above for ${name}`);
    await page.screenshot({
      path: path.join(shotsDir, `${name}.jpg`),
      quality: 92,
      clip: { x: frame.x, y: frame.y, width: frame.width, height },
    });
  }

  return { panel, shot, shotPlan, shotElement, shotAbove, scrollToTop };
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
