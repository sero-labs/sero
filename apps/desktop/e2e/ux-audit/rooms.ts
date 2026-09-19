/**
 * Rooms capture walk.
 *
 * Rooms are the deepest screen in the product: a list, three views of one Room,
 * five activity filters, five detail tabs, a roster and a member panel with its
 * own tabs. The profile holds ten real Rooms across six workspaces, covering
 * completed, paused-with-members-waiting and cancelled. Each is opened by
 * clicking its row, and the heading is read back so every shot is labelled with
 * the Room it actually shows.
 */

import type { Page } from '@playwright/test';
import type { AuditCapture } from '../helpers/ux-audit';
import { openApp } from '../helpers/ux-audit';
import { clickByLabel, clickIfPresent, panelScrollBottom, panelScrollTo } from './actions';
import { openRow, openTab, slugify } from './rows';

const AREA = 'rooms' as const;

/** Every workspace in the profile that holds Rooms, and what it covers. */
export const ROOM_WORKSPACES: Array<{ id: string; label: string; note: string }> = [
  { id: 'csv-summary-resilience-01', label: 'csv-summary-01', note: 'four Rooms: one paused with two members waiting on the user, three completed' },
  { id: 'import-dashboard-resilience-01', label: 'import-dashboard-01', note: 'one cancelled Room, which is what blocks its Architect' },
  { id: 'import-dashboard-resilience-02', label: 'import-dashboard-02', note: 'one completed discovery Room with a long brief' },
  { id: 'froggerneon', label: 'froggerneon', note: 'one completed Room that set the product direction' },
  { id: 'workspace-placement-diagnostic-01', label: 'workspace-placement', note: 'two completed Rooms, one per milestone' },
  { id: 'csv-summary-resilience-02', label: 'csv-summary-02', note: 'one completed discovery Room' },
];

export async function captureRoomsList(
  page: Page,
  capture: AuditCapture,
  workspaceId: string,
  state: string,
  slug: string,
  width: number,
): Promise<number> {
  const count = await openTab(page, workspaceId, 'Rooms');
  if (count < 0) {
    capture.gap(
      { id: `rooms-list-${slug}-${width}`, area: AREA, page: 'Rooms list', state, task: 'Find the Room that needs me', width },
      'The Rooms tab was not visible.',
    );
    return -1;
  }
  await capture.shot({
    id: `rooms-list-${slug}-${width}`,
    area: AREA,
    page: 'Rooms list',
    state: `${state} (${count} rows)`,
    task: 'Find the Room that needs me',
    width,
  });
  return count;
}

/** The new-Room flow as far as it goes without starting a planner call. */
export async function captureRoomCreate(page: Page, capture: AuditCapture, workspaceId: string, width: number): Promise<void> {
  await openApp(page, 'orchestrator', undefined, workspaceId);
  await page.waitForTimeout(1_800);
  await clickIfPresent(page, page.getByRole('button', { name: /^Home(\s*\d+)?$/ }).first());
  await page.waitForTimeout(1_200);
  const card = page.getByRole('button', { name: /Room.*Describe a problem/ }).first();
  if (!(await clickIfPresent(page, card))) {
    capture.gap(
      { id: `rooms-brief-${width}`, area: AREA, page: 'New Room', state: 'brief entry', task: 'Describe the problem for a team', width },
      'The Room create card was not visible on Home.',
    );
    return;
  }
  await page.waitForTimeout(1_500);
  await capture.shot({
    id: `rooms-brief-${width}`,
    area: AREA,
    page: 'New Room',
    state: 'brief entry — empty',
    task: 'Describe the problem for a team',
    width,
  });

  const box = page.locator('textarea').first();
  if (await box.isVisible().catch(() => false)) {
    await box.fill(
      'Summary totals in this repository disagree with the source rows, and the causes are not the same. '
      + 'Work out each cause separately, fix them, and open a pull request. Ask me before you settle on a '
      + 'rounding rule — that is a decision about the numbers, not about the code.',
    );
    await page.waitForTimeout(600);
    await capture.shot({
      id: `rooms-brief-filled-${width}`,
      area: AREA,
      page: 'New Room',
      state: 'brief entry — realistic brief typed, before Design',
      task: 'Check the brief before a team is proposed',
      width,
    });
  }

  for (const [name, slug, state] of [
    ['Advanced', 'advanced', 'advanced settings open'],
    ['Settings', 'settings', 'settings open'],
  ] as const) {
    const control = page.getByRole('button', { name: new RegExp(name, 'i') }).first();
    if (await clickIfPresent(page, control)) {
      await page.waitForTimeout(1_000);
      await capture.shot({ id: `rooms-${slug}-${width}`, area: AREA, page: 'New Room', state, task: 'Set limits before the team starts', width });
      break;
    }
    capture.gap(
      { id: `rooms-${slug}-${width}`, area: AREA, page: 'New Room', state, task: 'Set limits', width },
      `No "${name}" control on the brief screen.`,
    );
  }

  capture.gap(
    { id: `rooms-proposal-${width}`, area: AREA, page: 'New Room', state: 'planning, team proposal, adjust flow and draft review', task: 'Approve or adjust the proposed team', width },
    'Reaching the proposal needs a paid planner call. Not captured in the no-spend pass.',
  );
}

/** One Room: its views, activity filters, detail tabs, roster and member panel. */
export async function captureRoom(
  page: Page,
  capture: AuditCapture,
  base: string,
  label: string,
  state: string,
  task: string,
  width: number,
  deep: boolean,
): Promise<void> {
  await capture.shot({ id: `${base}-${width}`, area: AREA, page: label, state: `${state} — initial viewport`, task, width });
  if (!deep) return;

  await panelScrollBottom(page);
  await capture.shot({
    id: `${base}-scroll-${width}`,
    area: AREA,
    page: label,
    state: 'scrolled to the latest activity',
    task: 'See what happened most recently',
    width,
  });
  await panelScrollTo(page, 0);

  // The activity feed and its filters belong to the Timeline view. A completed
  // Room opens on its Result, where none of them exist, so the walk goes back
  // to Timeline before asking for a filter.
  const onTimeline = await clickByLabel(page, 'Timeline');
  await page.waitForTimeout(1_200);
  if (!onTimeline) {
    capture.gap(
      { id: `${base}-activity-highlights-${width}`, area: AREA, page: label, state: 'activity filters', task: 'Read the activity feed', width },
      'This Room does not offer the Timeline view, so it has no activity filters.',
    );
  } else {
    for (const [name, slug, filterTask] of [
      ['Highlights', 'activity-highlights', 'See the short version of what happened'],
      ['All', 'activity-all', 'See every event, including sessions and claims'],
      ['Decisions', 'activity-decisions', 'Find the decisions without the working detail'],
      ['Messages', 'activity-messages', 'Read what the members said to each other'],
      ['Work', 'activity-work', 'See the work items only'],
    ] as const) {
      if (!(await clickByLabel(page, name))) {
        capture.gap({ id: `${base}-${slug}-${width}`, area: AREA, page: label, state: `activity filter: ${name}`, task: filterTask, width }, `The "${name}" filter is not offered on this Room.`);
        continue;
      }
      await page.waitForTimeout(900);
      await capture.shot({ id: `${base}-${slug}-${width}`, area: AREA, page: label, state: `activity filter: ${name}`, task: filterTask, width });
    }

    // The side panel's five tabs sit beside the feed; there is no drawer to open.
    for (const [name, slug, tabTask] of [
      ['Brief', 'tab-brief', 'Re-read what the team was asked to do'],
      ['Work', 'tab-work', 'See the work board'],
      ['Claims', 'tab-claims', 'Check who holds which files'],
      ['Artifacts', 'tab-artifacts', 'Open what the team produced'],
      ['Changes', 'tab-changes', 'Review what changed in the workspace'],
    ] as const) {
      const tab = page.getByRole('tab', { name, exact: true }).first();
      if (!(await clickIfPresent(page, tab))) {
        capture.gap({ id: `${base}-${slug}-${width}`, area: AREA, page: label, state: `detail tab: ${name}`, task: tabTask, width }, `The "${name}" tab is not on this Room.`);
        continue;
      }
      await page.waitForTimeout(900);
      await capture.shot({ id: `${base}-${slug}-${width}`, area: AREA, page: label, state: `detail tab: ${name}`, task: tabTask, width });
    }
  }

  for (const [name, slug, viewTask] of [
    ['Watch', 'view-watch', 'Watch the members work without reading the log'],
    ['Result', 'view-result', 'Read the result and the evidence for it'],
    ['Timeline', 'view-timeline', 'Go back to the full record'],
  ] as const) {
    if (!(await clickByLabel(page, name))) {
      capture.gap({ id: `${base}-${slug}-${width}`, area: AREA, page: label, state: `${name} view`, task: viewTask, width }, `This Room does not offer the "${name}" view.`);
      continue;
    }
    await page.waitForTimeout(1_400);
    await capture.shot({ id: `${base}-${slug}-${width}`, area: AREA, page: label, state: `${name} view`, task: viewTask, width });
  }

  const member = page.locator('[data-app-panel] button').filter({ hasText: /\s—\s/ }).first();
  if (await clickIfPresent(page, member)) {
    await page.waitForTimeout(1_600);
    await capture.shot({
      id: `${base}-member-session-${width}`,
      area: AREA,
      page: label,
      state: 'member panel — Session',
      task: 'Read what one member actually did',
      width,
    });
    const info = page.getByRole('tab', { name: 'Info', exact: true }).first();
    if (await clickIfPresent(page, info)) {
      await page.waitForTimeout(900);
      await capture.shot({
        id: `${base}-member-info-${width}`,
        area: AREA,
        page: label,
        state: 'member panel — Info: model, tools, permissions, budget',
        task: 'Check what a member was allowed to touch and what it cost',
        width,
      });
    } else {
      capture.gap({ id: `${base}-member-info-${width}`, area: AREA, page: label, state: 'member Info tab', task: 'Check permissions and budget', width }, 'No Info tab on this member.');
    }
  } else {
    capture.gap(
      { id: `${base}-member-session-${width}`, area: AREA, page: label, state: 'member panel', task: 'Read one member', width },
      'No roster entry was clickable on this Room.',
    );
  }
}

/** Walk every Room row in one workspace. */
export async function captureRoomsIn(
  page: Page,
  capture: AuditCapture,
  workspace: { id: string; label: string; note: string },
  width: number,
  { max, deep }: { max: number; deep: boolean },
): Promise<void> {
  const count = await captureRoomsList(page, capture, workspace.id, workspace.note, workspace.label, width);
  if (count <= 0) return;

  for (let index = 0; index < Math.min(count, max); index += 1) {
    await openTab(page, workspace.id, 'Rooms');
    const heading = await openRow(page, index);
    if (!heading) {
      capture.gap(
        { id: `rooms-${workspace.label}-${index}-${width}`, area: AREA, page: 'Room', state: `row ${index}`, task: 'Open a Room', width },
        `Row ${index} of the ${workspace.label} Rooms list did not open.`,
      );
      continue;
    }
    const base = `rooms-${workspace.label}-${index}-${slugify(heading, String(index))}`;
    await captureRoom(page, capture, base, `Room — ${heading}`, `row ${index} of ${count}`, 'Understand what the team did and whether I must act', width, deep);
  }
}
