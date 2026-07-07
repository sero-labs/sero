/**
 * Auto-generated flagship demo: "I asked Sero to build itself a release-checklist
 * plugin." Drives the real build → review → install → run flow (same as
 * flagship-dryrun) with a fixed frame, burned-in captions, and Sero's own
 * recorder, then assembles a paced ~1080p YouTube MP4 outside the repo — the
 * long build section is time-lapsed, the rest plays real-time.
 *
 *   SERO_E2E_REAL_HOME=1 npx playwright test e2e/flagship-demo.agent.spec.ts --project=agent
 *
 * Output: ~/Movies/sero-demos/flagship-*.mp4 (override dir with SERO_DEMO_OUT).
 * The raw recording + markers.json are kept so post-processing can be re-run
 * (assembleDemo) without re-capturing.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp } from './helpers';
import { waitForShell } from './helpers/workflow';
import { createOpenAgentSession, promptAndCollectEvents, assistantTextFromEvents } from './helpers/agent';
import {
  caption,
  clearCaption,
  concatDemo,
  demoOutDir,
  installCaptionOverlay,
  setDemoWindow,
  startDemoRecording,
  stopRecordingRaw,
  titleCard,
} from './helpers/demo';

const REAL_HOME = process.env.SERO_E2E_REAL_HOME === '1';
const REPO_SLUG = 'sero-labs/sero';
const WS_NAME = 'flagship-demo-e2e';

const FLAGSHIP_PROMPT = [
  'Build me a release-checklist plugin and get it working inside Sero. It needs a UI panel called',
  '"Release Checklist" that produces a release readiness report for this repository — latest release',
  'tag and commits since it, whether the working tree is clean, open pull requests, and any',
  'release-blocking open issues — with a "Generate report" action that writes release-readiness.md',
  'and shows it in the panel. Build it as a standalone, installable Sero plugin like the community',
  'plugin examples (self-contained package, plain-React UI, only published dependency versions — no',
  'monorepo workspace links), so it installs from its local folder through the plugin manager. Do',
  'not commit, push, or post anything.',
].join(' ');

let app: ElectronApplication;
let page: Page;
let wsDir: string;
let sessionId: string;

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, '-c', 'user.email=e2e@sero.test', '-c', 'user.name=sero-e2e', ...args], {
    encoding: 'utf8',
  }).trim();
}

async function pumpApprovals(): Promise<void> {
  const pending = await page.evaluate(() => window.sero.userFeedback.getPending()).catch(() => []);
  for (const q of pending ?? []) {
    const answers: { questionId: string; value: string; label: string; wasCustom: boolean }[] = [];
    for (const item of q.questions) {
      const options = item.options ?? [];
      const pick =
        options.find((o) => /^(allow|approve|yes|attach|proceed|continue|ok)/i.test(o.label)) ??
        options.find((o) => !/block|cancel|deny|reject|no\b/i.test(o.label)) ??
        options[0];
      if (pick) answers.push({ questionId: item.id, value: pick.value, label: pick.label, wasCustom: false });
    }
    if (answers.length === 0) continue;
    await page
      .evaluate(({ id, responses }) => window.sero.userFeedback.answer({ id, answers: responses, cancelled: false }),
        { id: q.id, responses: answers })
      .catch(() => {});
  }
}

async function drivenTurn(prompt: string, timeoutMs: number): Promise<string> {
  const turn = promptAndCollectEvents(page, sessionId, prompt, timeoutMs);
  let settled = false;
  const marked = turn.finally(() => { settled = true; });
  while (!settled) {
    await pumpApprovals();
    await new Promise((r) => setTimeout(r, 4_000));
  }
  return assistantTextFromEvents((await marked).events);
}

function newPluginDir(): string | undefined {
  const untracked = git(wsDir, ['status', '--porcelain']).split('\n').filter((l) => l.startsWith('??')).map((l) => l.slice(3).trim());
  for (const entry of untracked) {
    const abs = path.join(wsDir, entry);
    const stack = [abs];
    while (stack.length) {
      const cur = stack.pop()!;
      if (!fs.existsSync(cur)) continue;
      if (fs.statSync(cur).isDirectory()) {
        if (path.basename(cur) === 'node_modules') continue;
        stack.push(...fs.readdirSync(cur).map((f) => path.join(cur, f)));
      } else if (path.basename(cur) === 'package.json') {
        try {
          if (JSON.parse(fs.readFileSync(cur, 'utf8'))?.sero?.app) return path.dirname(cur);
        } catch { /* ignore */ }
      }
    }
  }
  return undefined;
}

test.skip(!REAL_HOME, 'flagship demo drives the real app: SERO_E2E_REAL_HOME=1');

test('records the flagship "Sero builds itself a plugin" demo', async () => {
  test.setTimeout(3_600_000);
  const seroHome = path.join(os.homedir(), '.sero-ui');
  wsDir = path.join(seroHome, 'workspaces', WS_NAME);
  if (!fs.existsSync(path.join(wsDir, '.git'))) {
    fs.mkdirSync(path.dirname(wsDir), { recursive: true });
    execFileSync('git', ['clone', '-q', '--filter=blob:none', `https://github.com/${REPO_SLUG}.git`, wsDir]);
  }
  git(wsDir, ['reset', '--hard', 'origin/main']);
  git(wsDir, ['clean', '-fdx', '-e', '.sero']);
  fs.rmSync(path.join(wsDir, 'release-readiness.md'), { force: true });
  fs.mkdirSync(path.join(wsDir, '.git', 'info'), { recursive: true });
  fs.writeFileSync(path.join(wsDir, '.git', 'info', 'exclude'), '.sero/\n');

  ({ app, page } = await launchSeroApp({ seroHome, runtime: 'host', env: {}, slowMo: 120 }));
  await waitForShell(page);
  await setDemoWindow(app, 1280, 720);
  await installCaptionOverlay(page);

  const fixture = await createOpenAgentSession(page, wsDir, 'Flagship demo');
  sessionId = fixture.session.id;

  const dir = demoOutDir();
  const seg1 = path.join(dir, 'flagship-seg1-ask.mp4');
  const card = path.join(dir, 'flagship-card.mp4');
  const seg2 = path.join(dir, 'flagship-seg2-payoff.mp4');
  let buildOk = false;
  let reply = '';

  // ── Kick off the real build turn in the background; the approval pump runs
  //    inside drivenTurn. We record only its first ~30s (segment 1), let it
  //    finish OFF-camera, then record the reliable payoff (segment 2).
  const build = (async () => {
    reply = await drivenTurn(FLAGSHIP_PROMPT, 3_000_000);
    if (!newPluginDir()) {
      reply = await drivenTurn(
        'Finish the standalone, installable release-checklist plugin in this workspace (self-contained package, plain-React UI, published dependency versions only — no workspace links) so it builds and can be installed from its local folder. Do not commit or push.',
        1_800_000,
      );
    }
  })();

  try {
    // ── SEGMENT 1: the ask + the real build starting (~32s) ──────────────
    expect(await startDemoRecording(page, { fps: 15, crf: 20 })).toBe(true);
    await caption(page, 'I asked my AI workspace to build a feature for itself.', 4_000);
    await caption(page, 'Build a release-checklist plugin — and run it inside Sero.', 4_000);
    await caption(page, 'Sero plans it, then starts writing the plugin — live.', 3_000);
    // Let real activity show (chat streams, files appear in the tree).
    await page.waitForTimeout(18_000);
    await caption(page, 'Building the full plugin…  ⏩ sped up', 3_000);
    await stopRecordingRaw(page, seg1);

    // ── Build finishes off-camera (this is the long, boring part) ────────
    await build;
    const pluginDir = newPluginDir();
    expect(pluginDir, 'the agent must produce a sero.app plugin package').toBeTruthy();
    const appId: string = JSON.parse(fs.readFileSync(path.join(pluginDir!, 'package.json'), 'utf8')).sero.app.id;

    // ── SEGMENT 2: the reliable payoff — install → mount → report (~40s) ──
    expect(await startDemoRecording(page, { fps: 15, crf: 20 })).toBe(true);
    await caption(page, 'Sero finished. I review what it built, then install it.', 3_500);
    const installed = await page.evaluate((src) => window.sero.plugins.install(src), pluginDir!);
    expect(Boolean((installed as { id?: string })?.id), 'plugin installs from its local folder').toBe(true);

    await caption(page, 'It mounts inside Sero like any other app.', 3_000);
    expect(await page.evaluate((id) => Boolean(window.__appControl?.openApp(id)), appId)).toBe(true);
    await page.locator(`[data-app="${appId}"]`).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(3_000);

    await caption(page, 'And it produces a real release readiness report.', 3_000);
    await page.locator(`[data-app="${appId}"]`).first().getByRole('button', { name: /generate/i }).click({ timeout: 10_000 }).catch(() => {});
    await expect.poll(() => fs.existsSync(path.join(wsDir, 'release-readiness.md')), { timeout: 90_000 }).toBe(true);
    buildOk = true;
    await page.waitForTimeout(4_000);
    await caption(page, 'Sero extended itself — reviewed, installed, running.', 4_500);
    await clearCaption(page);
    await page.waitForTimeout(1_200);
    await stopRecordingRaw(page, seg2);
  } finally {
    fs.writeFileSync(path.join(dir, 'flagship-markers.json'), JSON.stringify({ buildOk, seg1, seg2, reply: reply.slice(0, 500) }, null, 2));
    await closeSeroApp(app).catch(() => {});
  }

  // ── Assemble: seg1 + a "sped up" build card + seg2 → 1080p YouTube MP4 ──
  expect(buildOk, 'the full flagship flow (build → install → report) must complete').toBe(true);
  await titleCard('Sero builds the full plugin — sped up', 2.5, card);
  const finalPath = path.join(dir, 'flagship-demo.mp4');
  await concatDemo([seg1, card, seg2], finalPath);
  // eslint-disable-next-line no-console
  console.log(`\n\n=== FLAGSHIP DEMO: ${finalPath}\n    segments: ${seg1} | ${seg2} ===\n`);
  expect(fs.existsSync(finalPath)).toBe(true);
});
