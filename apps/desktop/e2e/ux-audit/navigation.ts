/**
 * Cross-app navigation walk (flow G, "Follow the thread").
 *
 * The other walks reach each screen through `openApp`, so they photograph where
 * a move ends and never the move itself. This one clicks the real controls — a
 * milestone's Open in Orchestrator, a research Open Room, Back to Rooms, Back to
 * projects, Open in Agent Board and the title bar's Back and Forward — and
 * records, for each click, where the user was, what the control promised, and
 * where they landed. Nothing here creates, runs or deletes anything.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import type { AuditCapture } from '../helpers/ux-audit';
import { openApp } from '../helpers/ux-audit';
import { layout as layoutSel } from '../helpers/selectors';
import { clickIfPresent } from './actions';
import { openTab } from './rows';

const AREA = 'shell' as const;

/** Where the user is: the title bar, the panel heading, and what Back and Forward promise. */
interface Place {
  title: string;
  heading: string;
  back: string | null;
  forward: string | null;
  /** First 220 characters of the panel, to tell two places apart. */
  panel: string;
}

interface NavStep {
  journey: string;
  step: string;
  control: string;
  found: boolean;
  before: Place;
  after: Place | null;
  shot: string | null;
  /** Whether the landing page names where the user came from. */
  namesOrigin?: boolean;
}

async function where(page: Page): Promise<Place> {
  return page.evaluate((titleSel) => {
    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const bar = document.querySelector(titleSel);
    const panel = document.querySelector('[data-app-panel]') ?? document.body;
    const heading = panel.querySelector('h1, h2, h3');
    const label = (prefix: string) => {
      const button = bar?.querySelector(`button[aria-label^="${prefix}"]`) as HTMLButtonElement | null;
      if (!button) return null;
      return `${clean(button.getAttribute('aria-label'))}${button.disabled ? ' (disabled)' : ''}`;
    };
    return {
      title: clean(bar?.textContent).slice(0, 160),
      heading: clean(heading?.textContent).slice(0, 160),
      back: label('Back'),
      forward: label('Forward'),
      panel: clean(panel.textContent).slice(0, 220),
    };
  }, layoutSel.titleBar);
}

function titleButton(page: Page, prefix: 'Back' | 'Forward'): Locator {
  return page.locator(`${layoutSel.titleBar} button[aria-label^="${prefix}"]`).first();
}

export async function captureNavigation(page: Page, capture: AuditCapture, width: number, logFile: string): Promise<void> {
  const log: NavStep[] = [];

  /** Click one control, then record the move and photograph where it landed. */
  async function move(journey: string, step: string, control: string, target: Locator, origin?: string): Promise<boolean> {
    const before = await where(page);
    const found = await clickIfPresent(page, target);
    if (!found) {
      log.push({ journey, step, control, found, before, after: null, shot: null });
      capture.gap(
        { id: `nav-${journey}-${step}-${width}`, area: AREA, page: 'Cross-app navigation', state: `${control} — not found`, task: 'Follow the thread', width },
        `No "${control}" control was visible on "${before.heading || before.title}".`,
      );
      return false;
    }
    await page.waitForTimeout(2_400);
    const after = await where(page);
    const id = `nav-${journey}-${step}-${width}`;
    await capture.shot({
      id,
      area: AREA,
      page: 'Cross-app navigation',
      state: `${control}: "${before.heading || before.title}" → "${after.heading || after.title}"`,
      task: 'Follow the thread',
      width,
    });
    const namesOrigin = origin ? after.panel.includes(origin) || after.title.includes(origin) : undefined;
    log.push({ journey, step, control, found, before, after, shot: `${id}.png`, namesOrigin });
    return true;
  }

  // 1. A milestone into its Workflow, then back and forward again.
  await openApp(page, 'architect', { projectId: 'proj_v1hy1h7u' });
  await page.waitForTimeout(2_200);
  await move('milestone', '1-open', 'Open in Orchestrator', page.getByRole('button', { name: /Open in Orchestrator/ }).first(), 'DungeonExplorer');
  await move('milestone', '2-back', 'Title bar Back', titleButton(page, 'Back'));
  await move('milestone', '3-forward', 'Title bar Forward', titleButton(page, 'Forward'));

  // 2. A research Room from its project, out through Back to Rooms, then back.
  await openApp(page, 'architect', { projectId: 'proj_0hkazv71' });
  await page.waitForTimeout(2_200);
  await move('research', '1-open', 'Open Room', page.getByRole('button', { name: 'Open Room' }).first(), 'FroggerNeon');
  await move('research', '2-board', 'Open in Agent Board', page.getByRole('button', { name: /Open in Agent Board/ }).first());
  await move('research', '3-back', 'Title bar Back', titleButton(page, 'Back'));
  await move('research', '4-rooms', 'Back to Rooms', page.getByRole('button', { name: 'Back to Rooms' }).first());
  await move('research', '5-back', 'Title bar Back', titleButton(page, 'Back'));
  await move('research', '6-back', 'Title bar Back', titleButton(page, 'Back'));

  // 3. A project out to the list, and back.
  await openApp(page, 'architect', { projectId: 'proj_0hkazv71' });
  await page.waitForTimeout(2_200);
  await move('projects', '1-list', 'Back to projects', page.getByRole('button', { name: 'Back to projects' }).first());
  await move('projects', '2-back', 'Title bar Back', titleButton(page, 'Back'));

  // 4. Switch workspace while the Orchestrator is open.
  const rows = await openTab(page, 'froggerneon', 'Workflows');
  if (rows >= 0) {
    await move(
      'workspace',
      '1-switch',
      'Workspace row in the sidebar',
      page.locator(layoutSel.sidebarPanel).getByRole('button', { name: 'reading-tracker-resilience-01', exact: true }).first(),
    );
    await move('workspace', '2-back', 'Title bar Back', titleButton(page, 'Back'));
  }

  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.writeFileSync(logFile, `${JSON.stringify({ version: 1, width, steps: log }, null, 2)}\n`, 'utf8');
}
