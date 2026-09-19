/**
 * Orchestrator capture walk: Home, the Workflow list and detail, Goals, the
 * Library and the Catalog.
 *
 * Workflows are reached by clicking their row, because the plugin restores its
 * own route over a launch param. The heading is read back after each click, so
 * every shot is labelled with the workflow it actually shows.
 */

import type { Page } from '@playwright/test';
import type { AuditCapture } from '../helpers/ux-audit';
import { openApp } from '../helpers/ux-audit';
import { clickByLabel, clickIfPresent, closeOverlay, panelScrollBottom, panelScrollTo } from './actions';
import { openRow, openTab, slugify } from './rows';

const AREA = 'orchestrator' as const;

/** The workspaces whose Workflow lists are worth walking, and why. */
export const WORKFLOW_WORKSPACES: Array<{ id: string; label: string; note: string }> = [
  { id: 'reading-tracker-resilience-01', label: 'reading-tracker', note: 'six workflows: one active schedule, five complete' },
  { id: 'dungeonexplorer-resilience-01', label: 'dungeonexplorer', note: 'seven workflows including two drafts' },
  { id: 'workspace-placement-diagnostic-01', label: 'workspace-placement', note: 'four workflows including two disabled' },
  { id: 'froggerneon', label: 'froggerneon', note: 'an active workflow dispatched by an Architect milestone' },
];

/** Every top-level Orchestrator tab, in one workspace that has content. */
export async function captureOrchestratorTabs(
  page: Page,
  capture: AuditCapture,
  workspaceId: string,
  width: number,
): Promise<void> {
  await openApp(page, 'orchestrator', undefined, workspaceId);
  await page.waitForTimeout(2_000);

  const tabs: Array<[string, string, string, string]> = [
    ['Home', 'home', 'populated — three create cards and recent work', 'Decide what to start, and see what is already going'],
    ['Workflows', 'workflows', 'populated — six workflows, mixed statuses', 'Find the workflow that needs me'],
    ['Rooms', 'rooms', 'empty for this workspace', 'Start a Room, or see there are none'],
    ['Goals', 'goals', 'empty — no goals in this profile', 'Start a goal, or see there are none'],
    ['Library', 'library', 'empty — nothing saved', 'Reuse a saved workflow'],
    ['Catalog', 'catalog', 'populated — installable entries', 'Install a workflow someone else wrote'],
  ];

  for (const [label, slug, state, task] of tabs) {
    const tab = page.getByRole('button', { name: new RegExp(`^${label}(\\s*\\d+)?$`) }).first();
    if (!(await clickIfPresent(page, tab))) {
      capture.gap({ id: `orch-${slug}-${width}`, area: AREA, page: label, state, task, width }, `The "${label}" tab was not visible.`);
      continue;
    }
    await page.waitForTimeout(1_800);
    await capture.shot({ id: `orch-${slug}-${width}`, area: AREA, page: label, state, task, width });

    await panelScrollBottom(page);
    await capture.shot({
      id: `orch-${slug}-scroll-${width}`,
      area: AREA,
      page: label,
      state: `${state} — scrolled`,
      task,
      width,
    });
    await panelScrollTo(page, 0);
  }

  const catalogDetails = page.getByRole('button', { name: 'Details', exact: true }).first();
  await clickIfPresent(page, page.getByRole('button', { name: /^Catalog(\s*\d+)?$/ }).first());
  await page.waitForTimeout(1_400);
  if (await clickIfPresent(page, catalogDetails)) {
    await page.waitForTimeout(1_400);
    await capture.shot({
      id: `orch-catalog-entry-${width}`,
      area: AREA,
      page: 'Catalog',
      state: 'one entry opened — what installing it would add',
      task: 'Judge a catalog entry before installing it',
      width,
    });
    await closeOverlay(page);
  } else {
    capture.gap(
      { id: `orch-catalog-entry-${width}`, area: AREA, page: 'Catalog', state: 'entry detail', task: 'Judge a catalog entry', width },
      'No catalog entry offered a Details control.',
    );
  }

  await clickIfPresent(page, page.getByRole('button', { name: /^Workflows(\s*\d+)?$/ }).first());
  await page.waitForTimeout(1_200);
  if (await clickIfPresent(page, page.getByRole('button', { name: 'New workflow' }).first())) {
    await page.waitForTimeout(1_500);
    await capture.shot({
      id: `orch-create-describe-${width}`,
      area: AREA,
      page: 'Create workflow',
      state: 'describe — empty',
      task: 'Describe a repeatable job',
      width,
    });
    const box = page.locator('textarea').first();
    if (await box.isVisible().catch(() => false)) {
      await box.fill(
        'Every weekday morning, check the repository for failing CI runs and open GitHub issues that mention '
        + 'a crash. Triage each one, reproduce it where a test can, and write a short note saying what is wrong '
        + 'and what it would take to fix. Do not change any product code.',
      );
      await page.waitForTimeout(600);
      await capture.shot({
        id: `orch-create-described-${width}`,
        area: AREA,
        page: 'Create workflow',
        state: 'describe — long, realistic request typed',
        task: 'Check the request before planning starts',
        width,
      });
    }
    await closeOverlay(page);
  } else {
    capture.gap(
      { id: `orch-create-describe-${width}`, area: AREA, page: 'Create workflow', state: 'describe', task: 'Describe a repeatable job', width },
      'The "New workflow" button was not visible.',
    );
  }

  capture.gap(
    { id: `orch-create-planning-${width}`, area: AREA, page: 'Create workflow', state: 'planning, clarification, proposal and validation', task: 'Review the plan before it runs', width },
    'Every screen past Describe needs a paid planner call. Not captured in the no-spend pass.',
  );
}

/** One workflow detail page and the controls it offers. */
async function captureWorkflowDetail(
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
    state: `${state} — scrolled to the steps`,
    task: 'Read what each step was told to do and what it returned',
    width,
  });
  await panelScrollTo(page, 0);

  // Map and Details live inside the plan section, which some workflows keep
  // collapsed. Toggling blindly closes it on the ones that were already open,
  // so the toggle is only pressed when Map is not already on screen.
  const planMap = page.locator('[data-app-panel] button').filter({ hasText: /^\s*Map\s*$/ }).first();
  if (!(await planMap.isVisible().catch(() => false))) {
    await clickIfPresent(page, page.locator('[data-app-panel] button').filter({ hasText: /^Plan\d* ?step/i }).first());
    await page.waitForTimeout(900);
  }

  for (const [name, slug, viewState, viewTask] of [
    ['Map', 'map', 'plan map', 'See the order, branches and parallel groups'],
    ['Details', 'details', 'step list', 'Read the instruction and the expected result of one step'],
    ['Context', 'context', 'context control', 'Decide what a step is allowed to see'],
    ['Delivery', 'delivery', 'delivery control', 'Decide where the result is delivered'],
    ['Tune model & tools', 'tune', 'per-step model, agent and tool settings', 'Change the model a step runs on'],
    ['Reflect', 'reflect', 'reflection and suggestions', 'See what the workflow learnt from its runs'],
    ['Skill', 'skill', 'skill draft', 'Turn a proven workflow into a reusable skill'],
  ] as const) {
    if (!(await clickByLabel(page, name))) {
      capture.gap({ id: `${base}-${slug}-${width}`, area: AREA, page: label, state: viewState, task: viewTask, width }, `"${name}" is not offered on this workflow.`);
      continue;
    }
    await page.waitForTimeout(1_400);
    await capture.shot({ id: `${base}-${slug}-${width}`, area: AREA, page: label, state: viewState, task: viewTask, width });
    await closeOverlay(page);
    await page.waitForTimeout(300);
  }

  const attempts = page.getByRole('button', { name: /Attempt history/ }).first();
  if (await clickIfPresent(page, attempts)) {
    await page.waitForTimeout(1_200);
    await capture.shot({
      id: `${base}-attempts-${width}`,
      area: AREA,
      page: label,
      state: 'attempt history — earlier runs',
      task: 'Compare this run with the one before it',
      width,
    });
    await closeOverlay(page);
  } else {
    capture.gap(
      { id: `${base}-attempts-${width}`, area: AREA, page: label, state: 'attempt history', task: 'Compare runs', width },
      'This workflow has no attempt history control.',
    );
  }

  const step = page.locator('[data-app-panel] button[aria-pressed]').first();
  if (await clickIfPresent(page, step)) {
    await page.waitForTimeout(1_200);
    await capture.shot({
      id: `${base}-step-${width}`,
      area: AREA,
      page: label,
      state: 'one step selected — instruction, expected result, outcome',
      task: 'Judge whether the step did what it was asked',
      width,
    });
  } else {
    capture.gap(
      { id: `${base}-step-${width}`, area: AREA, page: label, state: 'step selected', task: 'Judge one step', width },
      'No selectable step node was on screen.',
    );
  }
}

/** Walk every workflow row in one workspace. */
export async function captureWorkflowsIn(
  page: Page,
  capture: AuditCapture,
  workspace: { id: string; label: string; note: string },
  width: number,
  { max, deep }: { max: number; deep: boolean },
): Promise<void> {
  const count = await openTab(page, workspace.id, 'Workflows');
  if (count <= 0) {
    capture.gap(
      { id: `orch-wf-${workspace.label}-${width}`, area: AREA, page: 'Workflow list', state: workspace.note, task: 'Find the workflow that needs me', width },
      count === 0 ? 'This workspace has no workflows.' : 'The Workflows tab was not visible.',
    );
    return;
  }

  await capture.shot({
    id: `orch-wf-list-${workspace.label}-${width}`,
    area: AREA,
    page: 'Workflow list',
    state: `${workspace.note} (${count} rows)`,
    task: 'Find the workflow that needs me',
    width,
  });

  for (let index = 0; index < Math.min(count, max); index += 1) {
    await openTab(page, workspace.id, 'Workflows');
    const heading = await openRow(page, index);
    if (!heading) {
      capture.gap(
        { id: `orch-wf-${workspace.label}-${index}-${width}`, area: AREA, page: 'Workflow detail', state: `row ${index}`, task: 'Open a workflow', width },
        `Row ${index} of the ${workspace.label} workflow list did not open.`,
      );
      continue;
    }
    const base = `orch-wf-${workspace.label}-${index}-${slugify(heading, String(index))}`;
    await captureWorkflowDetail(page, capture, base, `Workflow — ${heading}`, `row ${index} of ${count}`, 'Judge whether this workflow did its job', width, deep);
  }
}
