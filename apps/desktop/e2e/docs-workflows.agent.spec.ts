/**
 * Documentation capture — Workflows (docs plan phase 1).
 *
 * Drives one real Workflow over the Lattice demo world and writes the guide's
 * screenshots straight into the docs site. The plan for that world is chosen so
 * a single run shows every node badge the plan map can draw: a fan-out, a
 * recorded decision, a conditional route, an approval gate, and a feedback
 * route that loops back.
 *
 * It spends real money, so it is opt-in:
 *
 *   env -u ELECTRON_RUN_AS_NODE SERO_E2E_DOCS_CAPTURE=1 \
 *     npx playwright test e2e/docs-workflows.agent.spec.ts --project=agent
 *
 * SERO_E2E_LATTICE_DIR points at the seeded world. Shots that need no step to
 * run (orientation, zoom, the Details view, the Home overview) are taken from
 * the draft, before the Workflow is ever activated.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp, layout as layoutSel, workspace as workspaceSel } from './helpers';
import { waitForShell } from './helpers/workflow';
import { createDocsCapture, escapeRegExp, type DocsCapture } from './helpers/docs-capture';
import { BADGE_REQUESTS, readBadges, type PlanSteps } from './helpers/docs-plan-badges';

const ENABLED = process.env.SERO_E2E_DOCS_CAPTURE === '1';
/**
 * Re-frame against the plan the last run left, instead of paying for a new one.
 *
 * Crop rectangles, orientation and zoom are deterministic — none of them need a
 * fresh planner call to test. Iterate with SERO_E2E_DOCS_REUSE=1, then drop it
 * for the run that actually produces the published images.
 */
const REUSE = process.env.SERO_E2E_DOCS_REUSE === '1';
/**
 * Keep the workflow the last run left and drive it, instead of paying for a new
 * plan. Plan generation is two minutes and the repair below can be several more,
 * so a capture that only needs a run-time state should not buy a fresh plan.
 */
const REUSE_PLAN = process.env.SERO_E2E_DOCS_REUSE_PLAN === '1';
const LATTICE_DIR = process.env.SERO_E2E_LATTICE_DIR
  ?? path.join(os.homedir(), 'Documents', 'Dev', 'projects', 'sero', 'demos', 'lattice');
const SHOTS = path.resolve(__dirname, '..', '..', 'docs-site', 'docs', 'assets', 'images');

/**
 * The goal that makes one plan carry every badge.
 *
 * An earlier, softer wording ("check the levels, fix the failures, ask me before
 * you change the solver") produced only a decision and a conditional route. The
 * planner writes the mechanic it is asked for, so each one is now named in the
 * reader's own words: one check per file (fan-out), record the outcome
 * (decision), fix only the failures (conditional route), stop and ask before the
 * solver changes (approval gate), and try again on a failed re-check (feedback).
 */
const GOAL = [
  'Check the levels in levels/ — there are only a handful, so check each one separately,',
  'at most ten, and record for each whether it is solvable and whether it lands inside the',
  'difficulty band. Fix only the levels that failed and leave the passing ones alone.',
  'src/solver.js is off limits without my approval: stop and ask me before you change it.',
  'After a fix, re-run the check; if it still fails, loop back to the repair step and try again,',
  'at most three times round. Open a pull request when every level passes.',
  'Keep the plan tight — six or seven steps, not more.',
  // Limits are read from this description at create time. Left unsaid, the
  // planner picked 90,000 tokens, which the first run exhausted on the discovery
  // step and four of the six level checks, and blocked.
  'This is a long job: allow up to 2 million tokens and 60 minutes for the whole run.',
].join(' ');

let app: ElectronApplication;
let page: Page;
let wsId: string;
let stateDir: string;

interface LoopIndex { loops: { id: string; title: string }[] }


function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

let capture: DocsCapture;
const panel = () => capture.panel();
const shot = (name: string) => capture.shot(name);
const shotPlan = (name: string, options?: { withToolbar?: boolean; wholeCard?: boolean }) => capture.shotPlan(name, options);
const shotElement = (name: string, locator: ReturnType<Page['locator']>) => capture.shotElement(name, locator);
const scrollToTop = () => capture.scrollToTop();

/**
 * The question card the workflow parks on. Titled by whether the planner asked.
 *
 * `.first()`, not `.last()`: every ancestor containing the text matches the
 * filter, so `.last()` returns the innermost one — which is the header row, and
 * photographed as a 20-pixel strip. The regex is anchored to the start of the
 * text, so the outermost match is the card and nothing above it qualifies.
 */
const inputCard = () => panel()
  .locator('div')
  .filter({ hasText: /^(Needs your input|The planner needs a few answers first)/ })
  .first();

function loopIds(): string[] {
  return (readJson<LoopIndex>(path.join(stateDir, 'index.json'))?.loops ?? []).map((l) => l.id);
}

function loopFile(id: string): Record<string, any> | null {
  return readJson(path.join(stateDir, 'loops', id, 'loop.json'));
}

/**
 * Asks Refine for any mechanic the planner left out, one request at a time, and
 * captures the Refine box while doing it.
 *
 * A request that does not land is recorded and stepped over rather than thrown:
 * the remaining shots are still worth having, and the test's closing assertion
 * is what decides whether the plan was good enough to document.
 */
async function ensureEveryBadge(loopId: string, only?: string[]): Promise<string[]> {
  const steps = () => (loopFile(loopId)?.plan?.steps ?? []) as PlanSteps;
  const refused: string[] = [];
  let captured = false;

  // The approval gate is asked for first: it is the one feature a run-time
  // capture cannot do without, because it is what parks the run long enough to
  // photograph. Asking for the conditional route first cost three minutes a run
  // waiting on the request the planner is least willing to honour.
  const wanted = BADGE_REQUESTS
    .filter((badge) => !only || only.includes(badge.key))
    .sort((a, b) => Number(b.key === 'gate') - Number(a.key === 'gate'));

  for (const badge of wanted) {
    for (const ask of badge.asks) {
      if (!badge.missing(steps())) break;

      await panel().getByPlaceholder(/Update the plan/).fill(ask(steps()));
      if (!captured) {
        await shot('orchestrator-refine');
        captured = true;
      }
      await panel().getByRole('button', { name: 'Update plan' }).click();
      await page.waitForTimeout(1_000);

      await expect
        .poll(() => badge.missing(steps()), { timeout: 90_000, intervals: [3_000] })
        .toBe(false)
        .catch(() => undefined);
    }

    if (badge.missing(steps())) refused.push(badge.key);
  }

  return refused;
}

test.describe.configure({ mode: 'serial' });
test.skip(!ENABLED, 'Set SERO_E2E_DOCS_CAPTURE=1 to capture the Workflows guide images. It spends real money.');

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fs.mkdirSync(SHOTS, { recursive: true });

  if (!fs.existsSync(path.join(LATTICE_DIR, 'levels'))) {
    throw new Error(`No Lattice world at ${LATTICE_DIR}. Seed it first (docs plan phase 0).`);
  }
  stateDir = path.join(LATTICE_DIR, '.sero', 'apps', 'orchestrator');
  // Start from an empty panel on a real capture. A draft left by an earlier run
  // appears in the Home and Workflows shots, so the images would otherwise
  // depend on what happened to be captured before them. Scoped to the demo
  // world, and skipped when re-framing against the existing plan.
  if (!REUSE && !REUSE_PLAN) fs.rmSync(stateDir, { recursive: true, force: true });

  ({ app, page } = await launchSeroApp({
    seroHome: path.join(os.homedir(), '.sero-ui'),
    runtime: 'host',
  }));

  // The map scales itself to fit the panel, so a small window is what makes a
  // published plan unreadable. Give the window as much room as the display has.
  await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    win.setBounds({ x: 0, y: 0, width: Math.min(width, 2400), height: Math.min(height, 1500) });
  });

  capture = createDocsCapture(page, SHOTS);
  await waitForShell(page);

  const ws = await page.evaluate(async ({ folderPath }) => {
    const created = await window.sero.workspace.addFolder(folderPath, 'Lattice');
    window.dispatchEvent(new Event('sero:workspace-changed'));
    return created;
  }, { folderPath: LATTICE_DIR });
  wsId = ws.id;

  // With the real home the shell restores whatever layout the last run left, and
  // a collapsed sidebar hides the workspace tree entirely.
  const node = page.locator(workspaceSel.nodeById(wsId));
  if (!(await node.isVisible())) await page.locator(layoutSel.sidebarToggle).click();
  await node.click();
  await expect
    .poll(() => page.evaluate(() => window.sero.layout.load()), { timeout: 10_000 })
    .toMatchObject({ activeWorkspaceId: wsId });

  // The plan map is wide. Give the panel the whole window so nodes stay legible
  // at the docs site's content width. Collapse only what is actually open, for
  // the same reason the sidebar had to be opened above.
  if (await node.isVisible()) await page.locator(layoutSel.sidebarToggle).click();

  const opened = await page.evaluate(() => Boolean(window.__appControl?.openApp('orchestrator')));
  expect(opened).toBe(true);
  await expect(panel()).toBeVisible({ timeout: 20_000 });
});

test.afterAll(async () => {
  await closeSeroApp(app);
});

test('the draft plan carries every badge, and the map controls are captured', async () => {
  test.setTimeout(600_000);

  let loopId = '';
  let refused: string[] = [];

  if (REUSE || REUSE_PLAN) {
    // Open the plan the last run paid for.
    const entry = (readJson<LoopIndex>(path.join(stateDir, 'index.json'))?.loops ?? []).at(-1);
    expect(entry, 'nothing to reuse — run once without SERO_E2E_DOCS_REUSE first').toBeTruthy();
    loopId = entry!.id;

    // The list rows carry no test id, so the row is found by the title the
    // planner gave the workflow.
    await panel().locator('nav').getByRole('button', { name: /^Workflows(?: \d+)?$/ }).click();
    await panel().getByRole('button', { name: new RegExp(escapeRegExp(entry!.title)) }).first().click();
    await expect(panel().getByRole('radio', { name: 'Map' })).toBeVisible({ timeout: 20_000 });
    await panel().getByRole('radio', { name: 'Map' }).click();
    // A reused plan still has to carry every feature the legend describes.
    // Only the gate matters here: the draft shots are already captured, and this
    // pass exists to reach the run-time states.
    if (REUSE_PLAN) refused = await ensureEveryBadge(loopId, ['gate']);
  } else {
    const before = new Set(loopIds());
    await panel().getByRole('button', { name: 'New', exact: true }).click();
    await panel().getByPlaceholder(/Every 10 minutes/).fill(GOAL);
    await shot('orchestrator-lattice-describe');

    await panel().getByRole('button', { name: 'Generate plan' }).click();
    await expect(panel().getByText("Here's the plan the AI wrote")).toBeVisible({ timeout: 300_000 });

    await expect
      .poll(() => {
        loopId = loopIds().find((id) => !before.has(id)) ?? '';
        return loopId;
      }, { timeout: 20_000 })
      .not.toBe('');

    // The map is the default presentation on a draft — shot 1 needs no click.
    await shot('orchestrator-plan-map-draft');

    // The planner is not deterministic: the same goal yields a gate and a
    // conditional route on one pass and neither on the next. Rather than re-roll
    // the whole plan at cost, ask for what is missing the way a reader would —
    // through Refine, which the guide has to show anyway.
    refused = await ensureEveryBadge(loopId);
  }

  const steps = (loopFile(loopId)?.plan?.steps ?? []) as PlanSteps;
  const badges = readBadges(steps);
  fs.writeFileSync(
    path.join(SHOTS, '.lattice-plan-badges.json'),
    JSON.stringify({ loopId, badges, stepCount: steps.length, refused }, null, 2),
    'utf8',
  );
  // The presentation and direction controls are Radix toggle groups, so their
  // items are radios rather than buttons.
  const toggle = (name: string) => panel().getByRole('radio', { name });
  const zoomIn = () => panel().getByRole('button', { name: 'Zoom in' }).click();
  const fitMap = () => panel().getByRole('button', { name: 'Fit map' }).click();

  // Shot 3: vertical orientation. The map is one node wide here, so it never
  // scales itself down — cropped to the column, this is the view that survives
  // being placed in a docs content column.
  // No toolbar on this one: the toolbar spans the whole card, so keeping it
  // would force the crop back out to full width and reintroduce the dead space
  // either side of a single-column map. The controls are shown in the draft and
  // zoom shots instead.
  await toggle('Vertical').click();
  await shotPlan('orchestrator-plan-map-vertical', { withToolbar: false });

  // Shot 2: the badges, close enough to read. Zoomed in, the column is taller
  // than the card, so the start and the end of the plan are photographed
  // separately. Between them they carry every badge the legend names — the
  // decision and fan-out marks sit on the early steps, the gate and the
  // feedback route on the late ones.
  await zoomIn();
  await zoomIn();
  await shotPlan('orchestrator-plan-map-badges', { withToolbar: false });
  // The gate's shield is on the step that asks for approval, which is in the
  // middle of the plan and in neither of the other two frames.
  const gateStep = (loopFile(loopId)?.plan?.steps ?? [])
    .findIndex((step: Record<string, any>) => step.gate === 'approval');
  if (gateStep >= 0) {
    await panel().locator('button[aria-pressed]').nth(gateStep).scrollIntoViewIfNeeded();
    await shotPlan('orchestrator-plan-map-badges-gate', { withToolbar: false });
  }
  await panel().locator('button[aria-pressed]').last().scrollIntoViewIfNeeded();
  await shotPlan('orchestrator-plan-map-badges-end', { withToolbar: false });
  await fitMap();

  // Shot 4: the zoom control itself, with the percentage readout off its
  // fitted default.
  await toggle('Auto').click();
  await zoomIn();
  await zoomIn();
  await shot('orchestrator-plan-map-zoom');
  await fitMap();

  // Shot 5: a selected node opens the detail strip under the map.
  await panel().locator('button[aria-pressed]').nth(1).click();
  await shotPlan('orchestrator-plan-map-selected', { wholeCard: true });

  // Shot 10: the same plan as a Details spine. Deliberately parked on a step
  // rather than at the top: shot 12 is also a Details view scrolled to the top,
  // and the two came out byte-identical. This one is about reading a step's
  // instructions in full, so it frames a step.
  await toggle('Details').click();
  await scrollToTop();
  await page.evaluate(() => {
    document
      .querySelectorAll('[data-app="orchestrator"] [class*="overflow-auto"], [data-app="orchestrator"] [class*="overflow-y-auto"]')
      .forEach((element) => { element.scrollTop = 420; });
  });
  await shot('orchestrator-plan-details');
  await toggle('Map').click();

  // Shots 12 and 13 want a finished workflow, and re-framing runs against one
  // that has already finished. Taking them here costs nothing; a fresh capture
  // takes them at the end of its own run instead.
  if (REUSE && (loopFile(loopId)?.status ?? '') === 'complete') {
    await toggle('Details').click();
    await scrollToTop();
    await shot('orchestrator-lattice-complete');
    await panel().locator('nav').getByRole('button', { name: /^Home(?: \d+)?$/ }).click();
    await shot('orchestrator-home-overview');
  }

  // Only a fresh capture has to answer for the plan's contents. A re-framing
  // pass takes whatever plan is already there, and a run-time pass repairs just
  // the approval gate it needs to park on.
  if (REUSE || REUSE_PLAN) return;

  expect(badges, 'the planner produced a plan without every badge the guide documents').toMatchObject({
    decision: true,
    conditional: true,
    gate: true,
    fanOut: true,
    feedback: true,
  });
});

/**
 * The states a run passes through, and the picture each one owes the guide.
 *
 * A live run cannot be scripted step by step — the order and timing belong to
 * the workflow. So this watches the run and takes each shot the first time its
 * state appears, rather than expecting states in a fixed sequence. A state that
 * never happens leaves its picture missing, and the run records which.
 */
interface RunShot {
  name: string;
  file: string;
  ready: (loop: Record<string, any>) => boolean;
  take: () => Promise<void>;
}

test('a live run captures the gate, the feedback route, and the finished pull request', async () => {
  test.setTimeout(45 * 60_000);
  test.skip(REUSE, 'Re-framing mode never starts a run.');

  const entry = (readJson<LoopIndex>(path.join(stateDir, 'index.json'))?.loops ?? []).at(-1);
  expect(entry, 'no workflow to run — capture the draft first').toBeTruthy();
  const loopId = entry!.id;
  const loop = () => loopFile(loopId) ?? {};

  // Three different labels start a run, depending on what the workflow has
  // already done: the wizard offers "Activate workflow →", a draft in the detail
  // view offers "Activate", and one that has already finished offers "Run again".
  const start = ['Activate', 'Run again', 'Run next'];
  let started = false;
  for (const label of start) {
    const button = panel().getByRole('button', { name: new RegExp(`^${label}`) }).first();
    if (!(await button.isVisible().catch(() => false))) continue;
    await button.click();
    started = true;
    break;
  }
  expect(started, `no way to start the run — none of ${start.join(', ')} was on screen`).toBe(true);

  // A workflow that has already finished stays `complete` for a moment after the
  // restart is pressed. Without this wait the watch loop below sees a terminal
  // status on its first check and exits having captured nothing.
  await expect
    .poll(() => loop().status ?? '', { timeout: 120_000, intervals: [2_000] })
    .not.toMatch(/complete|blocked|failed/);

  const stepStates = (l: Record<string, any>) => Object.values(l.runtime?.stepStates ?? {}) as Record<string, any>[];
  const shots: RunShot[] = [
    {
      name: 'mid-run',
      file: 'orchestrator-lattice-running',
      ready: (l) => stepStates(l).some((s) => s.status === 'running'),
      take: () => shot('orchestrator-lattice-running'),
    },
    {
      name: 'skipped route',
      file: 'orchestrator-plan-map-skipped',
      ready: (l) => stepStates(l).some((s) => s.status === 'skipped'),
      take: () => shotPlan('orchestrator-plan-map-skipped', { withToolbar: false }),
    },
    {
      name: 'approval gate',
      file: 'orchestrator-gate-waiting',
      ready: (l) => Boolean(l.runtime?.pendingInput),
      // Cropped to the card. A panel shot here photographs whatever the plan
      // happens to be scrolled to, not the question being asked. A card that
      // cannot be found falls back to the panel rather than losing the shot,
      // since the state it documents only exists while the run is parked.
      take: () => shotElement('orchestrator-gate-waiting', inputCard())
        .catch(() => shot('orchestrator-gate-waiting')),
    },
    {
      name: 'feedback traversal',
      file: 'orchestrator-plan-map-feedback',
      ready: (l) => Object.values(l.runtime?.feedbackStates ?? {})
        .some((f) => ((f as Record<string, any>).traversals ?? 0) > 0),
      take: () => shotPlan('orchestrator-plan-map-feedback', { withToolbar: false }),
    },
  ];
  const taken = new Set<string>();
  const answered = new Map<string, number>();

  const deadline = Date.now() + 40 * 60_000;
  let status = '';
  while (Date.now() < deadline) {
    const current = loop();
    status = current.status ?? '';

    for (const entryShot of shots) {
      if (taken.has(entryShot.name) || !entryShot.ready(current)) continue;
      await entryShot.take().catch(() => undefined);
      taken.add(entryShot.name);
    }

    // Answer the gate the way a reader does — read the model's own choice
    // labels from state and press the approving one.
    const pending = current.runtime?.pendingInput;
    if (pending) {
      const key = String(pending.id ?? 'pending');

      // Shot 11: the same question gathered on Home, where a reader clears every
      // waiting workflow in one place. Going to Home leaves the workflow, and
      // the Workflows tab comes back to the LIST — so the workflow has to be
      // re-opened before anything on its detail can be pressed. Not doing that
      // is what made the approval click miss, silently, and stall a live run.
      if (!taken.has('needs you')) {
        await panel().locator('nav').getByRole('button', { name: /^Home(?: \d+)?$/ }).click();
        await shot('orchestrator-needs-you');
        await panel().locator('nav').getByRole('button', { name: /^Workflows(?: \d+)?$/ }).click();
        await panel().getByRole('button', { name: new RegExp(escapeRegExp(entry!.title)) }).first().click();
        await expect(panel().getByRole('button', { name: /Send answer/ })).toBeVisible({ timeout: 20_000 });
        taken.add('needs you');
      }

      const attempts = (answered.get(key) ?? 0) + 1;
      answered.set(key, attempts);
      // Retried while the question is still open, rather than assumed to have
      // worked. A click that lands clears pendingInput and this block stops.
      if (attempts <= 3) {
        const choices = pending.questions?.[0]?.choices as { id: string; label: string }[] | undefined;
        const approve = choices?.find((c) => /approve|yes|allow|proceed/i.test(c.id + c.label)) ?? choices?.[0];
        if (approve) await panel().getByRole('button', { name: approve.label, exact: true }).click();
        await panel().getByRole('button', { name: /Send answer/ }).click();
      } else if (attempts === 4) {
        throw new Error(`the workflow parked on "${key}" and three answers did not clear it`);
      }
    }

    if (['complete', 'blocked', 'failed'].includes(status)) break;
    await page.waitForTimeout(5_000);
  }

  await scrollToTop();
  await shot('orchestrator-lattice-complete');

  // Shot 13: the Home overview, with the run's outcome in the list.
  await panel().locator('nav').getByRole('button', { name: /^Home$/ }).click();
  await shot('orchestrator-home-overview');

  fs.writeFileSync(
    path.join(SHOTS, '.lattice-run.json'),
    JSON.stringify({
      loopId,
      status,
      block: loop().runtime?.block ?? null,
      captured: [...taken],
      missing: shots.filter((s) => !taken.has(s.name)).map((s) => s.name),
      deliveryRef: loop().runtime?.lastDeliveryRef ?? null,
    }, null, 2),
    'utf8',
  );

  expect(status, 'the run never reached a terminal state inside the time limit').not.toBe('');
});
