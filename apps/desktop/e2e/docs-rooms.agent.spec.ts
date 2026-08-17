/**
 * Documentation capture — Rooms (docs plan phase 2).
 *
 * Runs one real Room over the Meridian demo world and writes the guide's
 * screenshots straight into the docs site. Meridian has a defect no single
 * agent owns — order totals drift by a cent, for three unrelated reasons — so
 * the team, the question it asks, and the pull request at the end are all
 * genuine rather than staged.
 *
 * It spends real money and takes tens of minutes, so it is opt-in:
 *
 *   env -u ELECTRON_RUN_AS_NODE SERO_E2E_DOCS_ROOMS=1 \
 *     npx playwright test e2e/docs-rooms.agent.spec.ts --project=agent
 *
 * On a retry add SERO_E2E_DOCS_ROOMS_SKIP_SETUP=1: the setup screens are already
 * captured, so it asks for the reviewer in the brief and goes straight to Start,
 * which saves the second planner call. Host changes need `pnpm run
 * build:electron` first — the harness launches the built main process, not the
 * TypeScript, and a run started without it reproduces the bug you just fixed.
 *
 * The fixer is deliberately started without permission to push, so the
 * escalation approval the guide has to show happens on its own.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp, layout as layoutSel, workspace as workspaceSel } from './helpers';
import { waitForShell } from './helpers/workflow';
import { createDocsCapture, type DocsCapture } from './helpers/docs-capture';

const ENABLED = process.env.SERO_E2E_DOCS_ROOMS === '1';
/**
 * Stop at the proposal instead of starting the team.
 *
 * A Room run is tens of minutes and several concurrent agents. This proves every
 * selector up to the proposal — the tab, the brief box, the design button, the
 * roster — for the cost of one planner call, so a full run does not fail forty
 * minutes in on a button name.
 */
const DRY_RUN = process.env.SERO_E2E_DOCS_ROOMS_DRYRUN === '1';
/**
 * Re-photograph the Room the last run paid for, without starting anything.
 *
 * A Room is a deep screen — five detail tabs, five activity filters, a member
 * panel with its own tabs — and a guide that only shows the Highlights feed
 * leaves most of it undocumented. All of that is still readable on a finished
 * Room, so it is captured for free rather than during a paid run.
 */
const REUSE = process.env.SERO_E2E_DOCS_ROOMS_REUSE === '1';
/**
 * Go from the brief straight to Start.
 *
 * The setup screens are captured once and do not change between runs, but every
 * retry paid for them again — and the Adjust step is a whole second planner
 * call, a minute and a half before the team even begins. With this set, the
 * reviewer is asked for in the brief instead, so one design call produces the
 * same roster, and the setup shots are left as they are.
 *
 * The first design call cannot be skipped: without it there is no Room.
 */
const SKIP_SETUP = process.env.SERO_E2E_DOCS_ROOMS_SKIP_SETUP === '1';
const MERIDIAN_DIR = process.env.SERO_E2E_MERIDIAN_DIR
  ?? path.join(os.homedir(), 'Documents', 'Dev', 'projects', 'sero', 'demos', 'meridian');
const SHOTS = path.resolve(__dirname, '..', '..', 'docs-site', 'docs', 'assets', 'images');

/** Long enough for a real team to finish; a Room needing more has not earned a guide. */
const ROOM_TIMEOUT_MS = 40 * 60_000;

const BRIEF = [
  'Order totals in this repo are wrong. `npm test` fails four times and the causes are not the same:',
  'one is in the rounding helper, one is a lost update when payments arrive at the same time, and one',
  'is a retry that charges the customer more than once. Work out each cause separately, fix them, and',
  'open a pull request. Ask me before you settle on a rounding rule — that is a decision about the books,',
  'not about the code.',
].join(' ');

/**
 * A plain-English change to the proposal, for the guide's Adjust screenshot.
 *
 * Not about permissions: the proposal already lowers every member to
 * edit-workspace, so no one can push and the escalation approval the guide
 * documents arrives on its own when the pull request is due.
 */
const ADJUST = 'Add a reviewer who checks the three fixes together before the pull request is opened.';

/** The same team in one call: what Adjust would have asked for, said up front. */
const BRIEF_WITH_REVIEWER = `${BRIEF} ${ADJUST}`;

let app: ElectronApplication;
let page: Page;
let capture: DocsCapture;
let wsId: string;
let roomsDir: string;

const panel = () => capture.panel();
const shot = (name: string) => capture.shot(name);

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

interface RoomIndex { rooms: { id: string }[] }

function roomIds(): string[] {
  return (readJson<RoomIndex>(path.join(roomsDir, 'index.json'))?.rooms ?? []).map((r) => r.id);
}

function roomFile(id: string): Record<string, any> | null {
  return readJson(path.join(roomsDir, id, 'room.json'));
}

/**
 * The states a Room passes through, and the picture each owes the guide.
 *
 * As with the Workflows capture, the order belongs to the Room and not to the
 * test, so each shot is taken the first time its state is true.
 */
interface RoomShot {
  name: string;
  ready: (room: Record<string, any>) => boolean;
  take: () => Promise<void>;
}

function pendingApprovals(room: Record<string, any>): Record<string, any>[] {
  return (room.approvals ?? []).filter((a: Record<string, any>) => a.status === 'pending');
}

/**
 * The rounding rule the brief promised to decide. Answering it is what lets the
 * three fixes converge.
 */
const ROUNDING_ANSWER = [
  'Round each line to the nearest cent using banker’s rounding, then make the order total the sum of the',
  'rounded lines — never round the total separately. Where the split leaves a remainder, give the odd cents',
  'to the earliest lines so the sum always matches.',
].join(' ');

/**
 * Members that stopped because they need the user.
 *
 * `request-attention` sets the member to `blocked` and waits: only the user or
 * the Conductor can restart it. Nothing else in the Room answers, so a capture
 * run that ignores this state watches the Room sit still until its time limit —
 * which is exactly what a reader would see if they walked away.
 */
function membersNeedingUser(roomId: string): Record<string, any>[] {
  // Members live in their own files, not inside room.json.
  const dir = path.join(roomsDir, roomId, 'members');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((file) => readJson<Record<string, any>>(path.join(dir, file)))
    .filter((member): member is Record<string, any> => Boolean(member))
    .filter((member) => member.status === 'blocked' && /needs the user/i.test(String(member.statusDetail ?? '')));
}

/** Patterns two or more members hold at the same time. */
function overlappingClaims(room: Record<string, any>): boolean {
  const active = (room.claims ?? []).filter((c: Record<string, any>) => c.status === 'active');
  const byPattern = new Map<string, Set<string>>();
  for (const claim of active) {
    const owners = byPattern.get(claim.pattern) ?? new Set<string>();
    owners.add(claim.memberId);
    byPattern.set(claim.pattern, owners);
  }
  return [...byPattern.values()].some((owners) => owners.size > 1);
}

/**
 * Photographs the parts of a Room the activity feed does not show.
 *
 * The detail panel keeps the brief, the work board, the claims, the artifacts
 * and the roster changes on separate tabs, and the activity feed filters to five
 * different views of the same timeline. Each is worth a picture, and a finished
 * Room has content in all of them.
 *
 * A section that is not on screen is stepped over rather than failed: the Room's
 * own shape decides which tabs exist, and a missing picture is recorded by the
 * caller.
 */
async function captureRoomSections(): Promise<string[]> {
  const taken: string[] = [];

  const take = async (file: string) => {
    const written = await shot(file).then(() => true, () => false);
    if (written) taken.push(file);
  };

  /**
   * One region of the Room, rather than the whole panel.
   *
   * A stopped Room carries its stop banner across the top of every screen. It
   * belongs in the picture of a stopped Room and nowhere else — on a shot of the
   * work board it is a distraction that also dates the image. Cropping to the
   * region being documented removes it, and the result reads better at the docs
   * site's width.
   */
  const takeRegion = async (file: string, region: ReturnType<typeof panel>) => {
    const written = await capture.shotElement(file, region).then(() => true, () => false);
    if (written) taken.push(file);
  };
  const detailDrawer = () => panel().locator('[role="tablist"][aria-label="Room detail"]').locator('xpath=..');
  // Two levels up, not one: the tablist's parent is the pane's header strip
  // only, so cropping to it gave a 260px sliver with no tab content in it.
  const memberPane = () => panel().locator('[role="tablist"][aria-label="Member detail"]').locator('xpath=../..');

  // The Room as it stands: roster, activity and the header's time and spend.
  // Deliberately NOT `orchestrator-rooms-running`: this sweep runs after the
  // Room has finished, and naming it that overwrote the mid-run shot the watch
  // loop had already taken with a picture of a completed Room.
  await take('orchestrator-rooms-overview');

  // A Room that stopped itself shows the reason and what to do about it.
  const banner = panel().getByText('Nothing has moved for a while');
  if (await banner.isVisible().catch(() => false)) await take('orchestrator-rooms-paused');

  // The five detail tabs live inside the panel the Brief button opens, not on
  // the Room itself. They are real tabs — matched strictly as tabs, because the
  // activity filter beside them has a button called "Work" too, and a locator
  // that accepts either photographs the wrong control.
  const brief = panel().getByRole('button', { name: 'Brief', exact: true });
  if (await brief.isVisible().catch(() => false)) {
    await brief.click();
    for (const [label, file] of [
      ['Brief', 'orchestrator-rooms-brief-tab'],
      ['Work', 'orchestrator-rooms-work'],
      ['Claims', 'orchestrator-rooms-claims-tab'],
      ['Artifacts', 'orchestrator-rooms-artifacts'],
      ['Changes', 'orchestrator-rooms-changes'],
    ]) {
      const tab = panel().getByRole('tab', { name: label, exact: true });
      if (!(await tab.isVisible().catch(() => false))) continue;
      await tab.click();
      await takeRegion(file, detailDrawer());
    }
    await brief.click().catch(() => undefined);
  }

  // The activity filters are pressed buttons. "All" is the one worth showing
  // beside Highlights: session and claim events, which Highlights hides on
  // purpose, only appear there.
  for (const [label, file] of [['All', 'orchestrator-rooms-activity-all'], ['Decisions', 'orchestrator-rooms-decisions']]) {
    const filter = panel().getByRole('button', { name: label, exact: true });
    if (!(await filter.isVisible().catch(() => false))) continue;
    await filter.click();
    await take(file);
  }
  await panel().getByRole('button', { name: 'Highlights', exact: true }).click().catch(() => undefined);

  // The Watch view, which is the other half of the Room view control.
  const watch = panel().getByRole('button', { name: 'Watch', exact: true });
  if (await watch.isVisible().catch(() => false)) {
    await watch.click();
    await take('orchestrator-rooms-watch');
    await panel().getByRole('button', { name: 'Timeline', exact: true }).click().catch(() => undefined);
  }

  // A member's own panel: the transcript it worked through, and the Info tab
  // saying what it was allowed to touch. Roster entries are buttons carrying the
  // member's display name and status.
  const member = panel().getByRole('button', { name: /Specialist|Conductor|Reviewer/ }).first();
  if (await member.isVisible().catch(() => false)) {
    await member.click();
    for (const [label, file] of [['Session', 'orchestrator-rooms-member'], ['Info', 'orchestrator-rooms-member-info']]) {
      const tab = panel().getByRole('tab', { name: label, exact: true });
      if (!(await tab.isVisible().catch(() => false))) continue;
      await tab.click();
      // The Info tab puts the worktree's absolute path beside the mandate. The
      // mandate is worth publishing and the path is not, so the shot stops above
      // the card that holds it.
      if (label === 'Info') {
        const written = await capture.shotAbove(file, 'CONTEXT', memberPane()).then(() => true, () => false);
        if (written) taken.push(file);
        continue;
      }
      await takeRegion(file, memberPane());
    }
  }

  return taken;
}

test.describe.configure({ mode: 'serial' });
test.skip(!ENABLED, 'Set SERO_E2E_DOCS_ROOMS=1 to capture the Rooms guide images. It spends real money.');

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fs.mkdirSync(SHOTS, { recursive: true });

  if (!fs.existsSync(path.join(MERIDIAN_DIR, 'test'))) {
    throw new Error(`No Meridian world at ${MERIDIAN_DIR}. Seed it first (docs plan phase 0).`);
  }
  roomsDir = path.join(MERIDIAN_DIR, '.sero', 'apps', 'orchestrator', 'rooms');
  // An empty Rooms list is itself one of the pictures. Re-framing keeps the
  // Room the last run paid for, so it clears nothing.
  if (!REUSE) fs.rmSync(path.join(MERIDIAN_DIR, '.sero', 'apps', 'orchestrator'), { recursive: true, force: true });

  ({ app, page } = await launchSeroApp({
    seroHome: path.join(os.homedir(), '.sero-ui'),
    runtime: 'host',
  }));

  await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    win.setBounds({ x: 0, y: 0, width: Math.min(width, 2400), height: Math.min(height, 1500) });
  });

  capture = createDocsCapture(page, SHOTS);
  await waitForShell(page);

  const ws = await page.evaluate(async ({ folderPath }) => {
    const created = await window.sero.workspace.addFolder(folderPath, 'Meridian');
    window.dispatchEvent(new Event('sero:workspace-changed'));
    return created;
  }, { folderPath: MERIDIAN_DIR });
  wsId = ws.id;

  const node = page.locator(workspaceSel.nodeById(wsId));
  if (!(await node.isVisible())) await page.locator(layoutSel.sidebarToggle).click();
  await node.click();
  await expect
    .poll(() => page.evaluate(() => window.sero.layout.load()), { timeout: 10_000 })
    .toMatchObject({ activeWorkspaceId: wsId });
  if (await node.isVisible()) await page.locator(layoutSel.sidebarToggle).click();

  const opened = await page.evaluate(() => Boolean(window.__appControl?.openApp('orchestrator')));
  expect(opened).toBe(true);
  await expect(panel()).toBeVisible({ timeout: 20_000 });
  await panel().locator('nav').getByRole('button', { name: /^Rooms(?: \d+)?$/ }).click();
});

test.afterAll(async () => {
  await closeSeroApp(app);
});

test('the Room’s detail tabs, activity filters and member panel are captured', async () => {
  test.setTimeout(300_000);
  test.skip(!REUSE, 'Set SERO_E2E_DOCS_ROOMS_REUSE=1 to re-photograph the last Room for free.');

  const roomId = roomIds().at(-1);
  expect(roomId, 'no Room to re-photograph — run the live capture first').toBeTruthy();

  // A Rooms list entry is one button whose accessible name is the whole card:
  // title, nudge, member initials, and "N members · time · spend". The spend
  // line is the part every card has, whatever the Room is called.
  await panel().getByRole('button', { name: /members ·/ }).first().click();
  await expect(panel().getByRole('button', { name: 'Brief', exact: true })).toBeVisible({ timeout: 30_000 });

  const taken = await captureRoomSections();
  fs.writeFileSync(
    path.join(SHOTS, '.meridian-sections.json'),
    JSON.stringify({ roomId, taken }, null, 2),
    'utf8',
  );
  expect(taken.length, 'the Room detail showed none of its sections').toBeGreaterThan(3);
});

test('a live Meridian Room is captured from empty list to pull request', async () => {
  test.setTimeout(ROOM_TIMEOUT_MS + 5 * 60_000);
  test.skip(REUSE, 'Re-framing mode never starts a Room.');

  // Shot 1: the empty Rooms list.
  if (!SKIP_SETUP) await shot('orchestrator-rooms-empty');

  // Shot 2: the brief.
  const before = new Set(roomIds());
  await panel().getByRole('button', { name: 'New', exact: true }).click();
  await panel().getByPlaceholder(/session-fixation/).fill(SKIP_SETUP ? BRIEF_WITH_REVIEWER : BRIEF);
  if (!SKIP_SETUP) await shot('orchestrator-rooms-brief');

  await panel().getByRole('button', { name: 'Design the team' }).click();

  // Shot 3: the planner at work. Taken on a short race — if the planner is
  // quick, the proposal shot below covers the same ground.
  if (!SKIP_SETUP) {
    await page.waitForTimeout(2_500);
    await shot('orchestrator-rooms-designing').catch(() => undefined);
  }

  // Shot 4: the proposal — roster, access, limits, delivery.
  await expect(panel().getByRole('button', { name: 'Start room' })).toBeVisible({ timeout: 300_000 });
  if (!SKIP_SETUP) await shot('orchestrator-rooms-proposal');

  const roomId = roomIds().find((id) => !before.has(id));
  expect(roomId, 'the planner never wrote a draft Room').toBeTruthy();

  // Shot 5: Adjust, changing the proposal in plain English — and holding back
  // the push permission so the escalation later is genuine.
  // Adjust is a button that reveals the box, not a box. Looking for a
  // placeholder found nothing and skipped the step silently.
  let adjusted = false;
  const adjustButton = panel().getByRole('button', { name: 'Adjust', exact: true });
  if (!SKIP_SETUP && await adjustButton.isVisible().catch(() => false)) {
    await adjustButton.click();
    const box = panel().getByPlaceholder(/one implementer instead of two/);
    await expect(box).toBeVisible({ timeout: 20_000 });
    await box.fill(ADJUST);
    await shot('orchestrator-rooms-adjust');
    adjusted = true;

    // The submit reads "Rethink the team", and becomes "Rethinking…" while it
    // works — so it is matched on the stem both share.
    await panel().getByRole('button', { name: /^Rethink/ }).click();
    await expect(panel().getByRole('button', { name: 'Start room' })).toBeVisible({ timeout: 300_000 });
    await shot('orchestrator-rooms-adjusted');
  }

  if (DRY_RUN) {
    fs.writeFileSync(
      path.join(SHOTS, '.meridian-dryrun.json'),
      JSON.stringify({ roomId, reachedProposal: true, adjusted }, null, 2),
      'utf8',
    );
    return;
  }

  await panel().getByRole('button', { name: 'Start room' }).click();

  // A Room opens no session until the user allows one. Answer it the way a user
  // does, by pressing the button, so the consent surface is exercised.
  const allow = page.getByRole('button', { name: 'Allow' }).first();
  await expect(allow, 'the host never asked to allow agent sessions').toBeVisible({ timeout: 60_000 });
  await allow.click({ timeout: 10_000 }).catch(() => undefined);

  const room = () => roomFile(roomId!) ?? {};
  const taken = new Set<string>();
  const resolved = new Map<string, number>();

  const shots: RoomShot[] = [
    {
      name: 'running',
      ready: (r) => r.runtime?.status === 'running',
      take: () => shot('orchestrator-rooms-running'),
    },
    {
      name: 'member',
      ready: (r) => (r.memberIds ?? []).length > 0 && r.runtime?.status === 'running',
      take: async () => {
        // Open the first member on the roster to show its transcript and task.
        await panel().locator('[data-room-member], [data-testid="room-member"]').first().click()
          .catch(() => undefined);
        await shot('orchestrator-rooms-member');
      },
    },
    {
      name: 'approval',
      ready: (r) => pendingApprovals(r).length > 0,
      take: () => shot('orchestrator-rooms-approval'),
    },
    {
      name: 'claims',
      ready: overlappingClaims,
      take: () => shot('orchestrator-rooms-claims'),
    },
  ];

  const deadline = Date.now() + ROOM_TIMEOUT_MS;
  let status = '';
  while (Date.now() < deadline) {
    const current = room();
    status = current.runtime?.status ?? '';

    for (const entry of shots) {
      if (taken.has(entry.name) || !entry.ready(current)) continue;
      // Only a shot that was actually written counts as taken. Marking it
      // regardless turns a failed capture into a silently missing picture, and
      // the state it documents may never come round again.
      const written = await entry.take().then(() => true, () => false);
      if (written) taken.add(entry.name);
    }

    // Answer a member that stopped for the user. The brief promised this
    // question, and nothing else in the Room can answer it — an unanswered
    // member simply stands still for the rest of the run.
    for (const waiting of membersNeedingUser(roomId!)) {
      const key = `question:${waiting.id}:${waiting.statusAt ?? ''}`;
      const attempts = (resolved.get(key) ?? 0) + 1;
      resolved.set(key, attempts);
      if (attempts > 3) continue;

      if (!taken.has('question')) {
        await shot('orchestrator-rooms-question').then(() => taken.add('question'), () => undefined);
      }
      const box = panel().getByPlaceholder('Type your answer…').first();
      if (!(await box.isVisible().catch(() => false))) continue;
      await box.fill(ROUNDING_ANSWER);
      await panel().getByRole('button', { name: 'Send and continue' }).first().click()
        .catch(() => undefined);
    }

    // Approve whatever the Room asks for, including the push escalation the
    // Adjust step held back. A click that misses is retried while the request is
    // still open rather than assumed to have worked — an approval marked
    // resolved on a missed click stalls the Room for the rest of its time
    // limit.
    for (const approval of pendingApprovals(current)) {
      const attempts = (resolved.get(approval.id) ?? 0) + 1;
      resolved.set(approval.id, attempts);
      if (attempts > 3) continue;
      await panel().getByRole('button', { name: /^(Approve|Allow)$/ }).first().click()
        .catch(() => undefined);
    }

    if (['completed', 'failed', 'cancelled'].includes(status)) break;
    await page.waitForTimeout(5_000);
  }

  // Shot 11: paused, with the stop banner. Taken only if the Room is still
  // going — pausing a finished Room shows nothing.
  if (!['completed', 'failed', 'cancelled'].includes(status)) {
    await panel().getByRole('button', { name: /^Pause$/ }).first().click().catch(() => undefined);
    await expect.poll(() => room().runtime?.status ?? '', { timeout: 120_000, intervals: [3_000] })
      .toBe('paused')
      .catch(() => undefined);
    await shot('orchestrator-rooms-paused');
    await panel().getByRole('button', { name: /^Resume$/ }).first().click().catch(() => undefined);
    taken.add('paused');

    await expect
      .poll(() => room().runtime?.status ?? '', { timeout: ROOM_TIMEOUT_MS, intervals: [5_000] })
      .toMatch(/completed|failed|cancelled/)
      .catch(() => undefined);
    status = room().runtime?.status ?? status;
  }

  // Shot 12: completion — result, artifacts, pull request, cost.
  await shot('orchestrator-rooms-complete');

  // Everything the activity feed does not show. Taken here as well as in the
  // re-framing pass, so one live run leaves a complete set even if nothing is
  // run again.
  for (const file of await captureRoomSections().catch(() => [])) taken.add(file);

  const finished = room();
  fs.writeFileSync(
    path.join(SHOTS, '.meridian-room.json'),
    JSON.stringify({
      roomId,
      status,
      captured: [...taken],
      missing: shots.filter((s) => !taken.has(s.name)).map((s) => s.name),
      costUsd: finished.runtime?.usage?.costUsd ?? null,
      turns: finished.runtime?.usage?.turns ?? null,
      delivered: Boolean(finished.delivery?.deliveredAt),
      deliveryRef: finished.delivery?.deliveryRef ?? null,
      artifacts: (finished.artifacts ?? []).map((a: Record<string, any>) => ({ kind: a.kind, ref: a.ref })),
    }, null, 2),
    'utf8',
  );

  expect(status, 'the Room never reached a terminal state inside the time limit').toMatch(/completed|failed|cancelled/);
});
