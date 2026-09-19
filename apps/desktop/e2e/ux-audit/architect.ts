/**
 * Architect capture walk.
 *
 * Nine real projects carry most of the lifecycle between them, so the walk
 * deep-links to each by id rather than clicking through the list, and each
 * project is photographed for the state it actually holds. States no record in
 * this profile carries (intake in progress, an open decision, a charter waiting
 * for approval) are recorded as gaps by the caller, not invented here.
 */

import type { Page } from '@playwright/test';
import type { AuditCapture } from '../helpers/ux-audit';
import { openApp } from '../helpers/ux-audit';
import { panelScrollTo, panelScrollBottom, closeOverlay, clickIfPresent, openSummaries, canScroll } from './actions';

export interface ArchitectProject {
  id: string;
  slug: string;
  /** The workspace that owns it. Opening the project without it leaves the
   *  previous workspace active, and views that read workspace state come back
   *  empty against the wrong folder. */
  workspace: string;
  name: string;
  state: string;
  task: string;
}

/** Each project stands in for the lifecycle state its record actually holds. */
export const PROJECTS: ArchitectProject[] = [
  { id: 'proj_qn41rq7m', workspace: 'reading-tracker-resilience-01', slug: 'reading-tracker', name: 'reading-tracker-resilience-01', state: 'maintain, active, scheduled maintenance', task: 'Know whether the finished product still needs me' },
  { id: 'proj_0hkazv71', workspace: 'froggerneon', slug: 'froggerneon', name: 'FroggerNeon', state: 'build, delegated workflow running, owner idle', task: 'See that a milestone is being built without opening it' },
  { id: 'proj_v1hy1h7u', workspace: 'dungeonexplorer', slug: 'dungeonexplorer', name: 'DungeonExplorer', state: 'build, blocked, workflow stopped, retry offered', task: 'Understand what stopped and how to restart it' },
  { id: 'proj_7hu8op88', workspace: 'csv-summary-resilience-01', slug: 'csv-summary-01', name: 'CSV Summary Resilience 01', state: 'build, paused owner, linked Room paused', task: 'Tell a paused owner apart from stalled work' },
  { id: 'proj_ctn5onpd', workspace: 'import-dashboard-resilience-01', slug: 'import-dashboard-01', name: 'import-dashboard-resilience-01', state: 'discovery, blocked, research Room cancelled, no cap', task: 'Recover a project whose research was cancelled' },
  { id: 'proj_1vziwclw', workspace: 'workspace-placement-diagnostic-01', slug: 'workspace-placement', name: 'workspace-placement-diagnostic-01', state: 'maintain, paused, blocked, workflow needs retry', task: 'Find the one thing that needs a decision' },
  { id: 'proj_r3cuw2ow', workspace: 'csv-summary-resilience-02', slug: 'csv-summary-02', name: 'csv-summary-resilience-02', state: 'maintain, spend above the cap', task: 'See that the cap stopped the work' },
  { id: 'proj_zubm5efe', workspace: 'import-dashboard-resilience-02', slug: 'import-dashboard-02', name: 'import-dashboard-resilience-02', state: 'maintain, paused owner, maintenance milestone running', task: 'Tell whether a paused project still has workers running' },
  { id: 'proj_sdarelmw', workspace: 'dungeonexplorer-resilience-01', slug: 'dungeon-resilience', name: 'DungeonExplorer Resilience 01', state: 'maintain, delivered, long charter history', task: 'Read the delivery record of a finished project' },
];

const AREA = 'architect' as const;

async function openProject(page: Page, projectId: string, workspace?: string): Promise<void> {
  await openApp(page, 'architect', { projectId }, workspace);
  await page.waitForTimeout(1_200);
}

/** The projects list, its rows and the intake dialog. */
export async function captureArchitectList(page: Page, capture: AuditCapture, width: number): Promise<void> {
  await openApp(page, 'architect');
  await page.waitForTimeout(800);
  await clickIfPresent(page, page.getByRole('button', { name: 'Back to projects' }).first());
  await page.waitForTimeout(800);

  await capture.shot({
    id: `architect-list-${width}`,
    area: AREA,
    page: 'Projects list',
    state: 'populated — nine projects, mixed phases',
    task: 'See every project and which one needs me',
    width,
  });

  if (await canScroll(page)) {
  await panelScrollBottom(page);
  await capture.shot({
    id: `architect-list-scrolled-${width}`,
    area: AREA,
    page: 'Projects list',
    state: 'scrolled to the last rows',
    task: 'Compare projects below the fold',
    width,
  });
  await panelScrollTo(page, 0);
  }

  const newProject = page.getByRole('button', { name: /New project|New Project/ }).first();
  if (await clickIfPresent(page, newProject)) {
    await page.waitForTimeout(900);
    await capture.shot({
      id: `architect-intake-${width}`,
      area: AREA,
      page: 'Intake dialog',
      state: 'empty, before an idea is typed',
      task: 'Describe an idea and choose where it runs',
      width,
    });

    const idea = page.locator('textarea').first();
    if (await idea.isVisible().catch(() => false)) {
      await idea.fill(
        'Build a small desktop reading tracker that stores books locally, keeps notes per book, '
        + 'and survives a restart without losing anything. It must run offline and need no account.',
      );
      await page.waitForTimeout(500);
      await capture.shot({
        id: `architect-intake-filled-${width}`,
        area: AREA,
        page: 'Intake dialog',
        state: 'idea typed, model and location options visible',
        task: 'Check the model and location before starting',
        width,
      });
    }
    await closeOverlay(page);
  } else {
    capture.gap(
      { id: `architect-intake-${width}`, area: AREA, page: 'Intake dialog', state: 'empty', task: 'Describe an idea', width },
      'No "New project" control was visible on the list.',
    );
  }
}

/** One project page: initial view, scrolled sections, disclosures, menus and sub-views. */
export async function captureArchitectProject(
  page: Page,
  capture: AuditCapture,
  project: ArchitectProject,
  width: number,
  { deep }: { deep: boolean },
): Promise<void> {
  await openProject(page, project.id, project.workspace);
  const base = `architect-${project.slug}`;

  await capture.shot({
    id: `${base}-${width}`,
    area: AREA,
    page: `Project — ${project.name}`,
    state: `${project.state} — initial viewport`,
    task: project.task,
    width,
  });

  if (!deep) return;

  await panelScrollTo(page, 900);
  await capture.shot({
    id: `${base}-scroll1-${width}`,
    area: AREA,
    page: `Project — ${project.name}`,
    state: 'scrolled — milestone rail',
    task: 'Check which milestones are verified, accepted or delivered',
    width,
  });

  if (await canScroll(page)) {
  await panelScrollBottom(page);
  await capture.shot({
    id: `${base}-scroll2-${width}`,
    area: AREA,
    page: `Project — ${project.name}`,
    state: 'scrolled to the end — directives and reply box',
    task: 'Read the current directive and reply',
    width,
  });
  }

  await panelScrollTo(page, 0);
  const opened = await openSummaries(page);
  if (opened > 0) {
    await capture.shot({
      id: `${base}-disclosed-${width}`,
      area: AREA,
      page: `Project — ${project.name}`,
      state: `every disclosure expanded (${opened})`,
      task: 'Read the research findings and the evidence behind a claim',
      width,
    });
    await panelScrollTo(page, 1400);
    await capture.shot({
      id: `${base}-disclosed-scroll-${width}`,
      area: AREA,
      page: `Project — ${project.name}`,
      state: 'expanded disclosures, scrolled to the evidence rows',
      task: 'Check the commands that proved a milestone',
      width,
    });
    await page.reload().catch(() => undefined);
    await page.waitForTimeout(1_500);
    await openProject(page, project.id, project.workspace);
  } else {
    capture.gap(
      { id: `${base}-disclosed-${width}`, area: AREA, page: `Project — ${project.name}`, state: 'expanded disclosures', task: project.task, width },
      'This project page rendered no disclosure elements.',
    );
  }

  const controls = page.getByRole('button', { name: 'Project controls' }).first();
  if (await clickIfPresent(page, controls)) {
    await page.waitForTimeout(600);
    await capture.shot({
      id: `${base}-controls-${width}`,
      area: AREA,
      page: `Project — ${project.name}`,
      state: 'project controls menu open',
      task: 'Pause, change the cap, autonomy or execution location',
      width,
    });
    await closeOverlay(page);
  } else {
    capture.gap(
      { id: `${base}-controls-${width}`, area: AREA, page: `Project — ${project.name}`, state: 'controls menu', task: project.task, width },
      'The project controls button was not visible.',
    );
  }
}

/** Model settings and the run inspector, both reached from the controls menu. */
export async function captureArchitectSubViews(
  page: Page,
  capture: AuditCapture,
  project: ArchitectProject,
  width: number,
): Promise<void> {
  const base = `architect-${project.slug}`;

  // The menu labels carry a trailing ellipsis: "Models…", "Run inspector…".
  for (const [label, id, state, task] of [
    ['Models', 'models', 'inherited and overridden model choices', 'Check which model each role will use'],
    ['Run inspector', 'inspector', 'populated activity for the project lifetime', 'Find out what the owner actually did'],
  ] as const) {
    await openProject(page, project.id, project.workspace);
    const controls = page.getByRole('button', { name: 'Project controls' }).first();
    if (!(await clickIfPresent(page, controls))) {
      capture.gap({ id: `${base}-${id}-${width}`, area: AREA, page: label, state, task, width }, 'Controls menu unavailable.');
      continue;
    }
    await page.waitForTimeout(500);
    const pattern = new RegExp(`^${label}`, 'i');
    const entry = page.getByRole('menuitem', { name: pattern }).first();
    const item = page.locator('[role="menu"] *').filter({ hasText: pattern }).last();
    const clicked = (await clickIfPresent(page, entry)) || (await clickIfPresent(page, item));
    if (!clicked) {
      await closeOverlay(page);
      capture.gap({ id: `${base}-${id}-${width}`, area: AREA, page: label, state, task, width }, `No "${label}" entry in the controls menu.`);
      continue;
    }
    await page.waitForTimeout(1_200);
    await capture.shot({ id: `${base}-${id}-${width}`, area: AREA, page: label, state, task, width });
    if (id === 'inspector') await captureInspectorActivity(page, capture, base, width);
    await panelScrollBottom(page);
    await capture.shot({
      id: `${base}-${id}-scroll-${width}`,
      area: AREA,
      page: label,
      state: `${state} — scrolled`,
      task,
      width,
    });
  }
}

/**
 * The Run inspector behind its "Load activity" button.
 *
 * The first screen is the whole inspector for most readers: every total reads
 * "—" until the button is pressed, so a walk that photographs the landing state
 * records an empty page and calls it the inspector. Only one project in this
 * profile carries a run journal, so the loaded state exists on exactly one
 * screen and is worth several frames.
 */
async function captureInspectorActivity(
  page: Page,
  capture: AuditCapture,
  base: string,
  width: number,
): Promise<void> {
  const task = 'Read what the run actually cost and what it did';
  const load = page.getByRole('button', { name: /^Load activity/i }).first();
  if (!(await clickIfPresent(page, load))) {
    capture.gap(
      { id: `${base}-inspector-loaded-${width}`, area: AREA, page: 'Run inspector', state: 'activity loaded', task, width },
      'No "Load activity" button: this project has no run journal.',
    );
    return;
  }
  await page.waitForTimeout(2_500);
  await capture.shot({
    id: `${base}-inspector-loaded-${width}`,
    area: AREA,
    page: 'Run inspector',
    state: 'activity loaded — rows, filters, spend and per-model totals',
    task,
    width,
  });
  await panelScrollBottom(page);
  await capture.shot({
    id: `${base}-inspector-loaded-scroll-${width}`,
    area: AREA,
    page: 'Run inspector',
    state: 'activity loaded — scrolled to the row list',
    task,
    width,
  });
  // "failures only" is the one filter that answers a question a person asks.
  const failures = page.getByRole('checkbox', { name: /failures only/i }).first();
  if (await clickIfPresent(page, failures)) {
    await page.waitForTimeout(1_200);
    await capture.shot({
      id: `${base}-inspector-failures-${width}`,
      area: AREA,
      page: 'Run inspector',
      state: 'failures only',
      task: 'See only what went wrong',
      width,
    });
    await clickIfPresent(page, failures);
    await page.waitForTimeout(600);
  } else {
    capture.gap(
      { id: `${base}-inspector-failures-${width}`, area: AREA, page: 'Run inspector', state: 'failures only', task: 'See only what went wrong', width },
      'No "failures only" checkbox once activity is loaded.',
    );
  }
}
