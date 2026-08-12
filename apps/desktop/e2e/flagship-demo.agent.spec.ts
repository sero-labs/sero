/**
 * Public-launch plugin workflow: describe, create, install, and use a plugin
 * through visible controls in one existing Sero process.
 *
 *   SERO_E2E_EXISTING_CDP=9222 npx playwright test e2e/flagship-demo.agent.spec.ts --project=agent
 *
 * Output: ~/Movies/sero-demos/plugin-build.mp4 and the complete raw recording.
 *
 * Add SERO_DEMO_REHEARSE=1 to reuse the plugin an earlier run built and skip
 * the build. A rehearsal takes about a minute instead of about ten, so the
 * install and report steps can be tested without paying for a full build. Its
 * recording is never publishable, so every rehearsal file carries a
 * `rehearsal-` prefix.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { chat, connectToRunningSero, layout } from './helpers';
import { openExplorer, waitForShell } from './helpers/workflow';
import {
  assembleDemo,
  CAMPAIGN_CLIPS,
  caption,
  clearCaption,
  clickForDemo,
  createDemoInteractionLog,
  createReviewContactSheet,
  demoOutDir,
  installCaptionOverlay,
  startDemoRecording,
  stopRecordingRaw,
  validateDemoVideo,
} from './helpers/demo';
import {
  deleteWorkspaceSessions,
  expectCleanDemoStage,
  installPluginFromFolder,
  removeDemoPlugin,
  type DemoPluginIdentity,
} from './helpers/demo-setup';
import { waitForAgentTurn } from './helpers/demo-agent-turn';

const EXISTING_CDP = process.env.SERO_E2E_EXISTING_CDP;
const WS_NAME = 'release-checklist-demo';
const PLUGIN_FOLDER = 'release-checklist-plugin';
const REPORT_FILE = 'release-readiness.md';

/** Reuse the plugin an earlier run built. See the file header. */
const REHEARSE = process.env.SERO_DEMO_REHEARSE === '1';
const FILE_PREFIX = REHEARSE ? 'rehearsal-' : '';

/** What the prompt asks for, and what the stage must be clean of beforehand. */
const DEMO_PLUGIN: DemoPluginIdentity = { id: 'release-checklist', name: 'Release Checklist' };

const PLUGIN_PROMPT = `Build a standalone release checklist plugin for this project.

Create it in a new folder named \`release-checklist-plugin\`.

Add a panel named \`Release Checklist\`.

The panel needs one \`Generate report\` action.

The report must show:

- The latest release.
- Changes since that release.
- Current uncommitted changes.
- Open pull requests.
- Release-blocking issues.

Show the report in the panel as formatted text, not as raw markdown.

Save the same report as \`release-readiness.md\` in the project folder.

Use the installed plugin-building skill and make the package ready to install from its folder.

Build it, but do not install or commit it.

Proceed without asking follow-up questions.`;

let browser: Browser;
let page: Page;

const interactions = createDemoInteractionLog();

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function prepareWorkspace(): string {
  const wsDir = path.join(os.homedir(), '.sero-ui', 'workspaces', WS_NAME);
  if (REHEARSE) {
    expect(
      fs.existsSync(path.join(wsDir, PLUGIN_FOLDER, 'package.json')),
      'rehearsal mode reuses the plugin an earlier run built, and there is none',
    ).toBe(true);
    // Delete the earlier report so the Generate report step still proves itself.
    fs.rmSync(path.join(wsDir, REPORT_FILE), { force: true });
    return wsDir;
  }
  fs.rmSync(wsDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(wsDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(wsDir, 'README.md'), '# Launchpad\n\nA small product release project.\n');
  fs.writeFileSync(path.join(wsDir, 'package.json'), JSON.stringify({
    name: 'launchpad',
    private: true,
    version: '1.1.0',
  }, null, 2));
  fs.writeFileSync(path.join(wsDir, 'src', 'index.ts'), 'export const releaseName = \"Launchpad 1.1\";\n');
  git(wsDir, ['init', '-q']);
  git(wsDir, ['config', 'user.name', 'Demo User']);
  git(wsDir, ['config', 'user.email', 'demo@example.com']);
  git(wsDir, ['add', '.']);
  git(wsDir, ['commit', '-q', '-m', 'chore: create launchpad']);
  git(wsDir, ['tag', 'v1.0.0']);
  fs.writeFileSync(path.join(wsDir, 'CHANGELOG.md'), '# Changes\n\n- Prepare the Launchpad 1.1 release.\n');
  git(wsDir, ['add', 'CHANGELOG.md']);
  git(wsDir, ['commit', '-q', '-m', 'feat: prepare launchpad 1.1']);
  return wsDir;
}

/** Add the demo workspace, clear its earlier sessions, and open one new session. */
async function createVisibleAgentSession(workspacePath: string) {
  const workspace = await page.evaluate(
    ({ folderPath, name }) => window.sero.workspace.addFolder(folderPath, name),
    { folderPath: workspacePath, name: 'Release Checklist Demo' },
  );
  await deleteWorkspaceSessions(page, workspace.id);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForShell(page);

  const workspaceNode = page.getByTestId(`workspace-node-${workspace.id}`);
  await expect(workspaceNode).toBeVisible({ timeout: 10_000 });
  await workspaceNode.locator('xpath=..').locator('[title="New session"]').click();

  await expect.poll(
    async () => page.evaluate((id) => window.sero.sessions.list(id).then((s) => s.length), workspace.id),
    { message: 'the visible New session action must create exactly one session', timeout: 10_000 },
  ).toBe(1);

  await expect(page.locator(chat.emptyNoMessages)).toBeVisible({ timeout: 10_000 });
}

/** Fail early if the agent named the plugin something the demo cannot show. */
function readGeneratedPluginApp(pluginPath: string): DemoPluginIdentity {
  const packageFile = path.join(pluginPath, 'package.json');
  expect(fs.existsSync(packageFile), 'the requested plugin package must exist').toBe(true);
  const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8')) as {
    sero?: { app?: { id?: string; name?: string } };
  };
  const app = packageJson.sero?.app;
  expect(app, 'package.json must declare sero.app').toBeTruthy();
  expect(app?.id, 'sero.app.id must be set').toBeTruthy();
  // The panel name is what the caption claims and what the stage was cleared
  // of. The id is the agent's choice, so read it rather than assume it.
  expect(app?.name, 'the built panel must carry the name the prompt asked for')
    .toBe(DEMO_PLUGIN.name);
  return { id: app!.id!, name: app!.name! };
}

test.skip(!EXISTING_CDP, 'plugin workflow recording needs SERO_E2E_EXISTING_CDP');
test.skip(process.platform !== 'darwin', 'native folder selection is automated on macOS');

test('records the complete plugin workflow', async () => {
  test.setTimeout(3_600_000);
  const wsDir = prepareWorkspace();
  ({ browser, page } = await connectToRunningSero({ slowMo: 100 }));

  const dir = demoOutDir();
  const rawPath = path.join(dir, `${FILE_PREFIX}plugin-build-raw.mp4`);
  const finalPath = path.join(dir, `${FILE_PREFIX}${CAMPAIGN_CLIPS['plugin-build'].fileName}`);
  const manifestPath = path.join(dir, `${FILE_PREFIX}plugin-build.json`);
  let recordedAt = 0;
  let recordingStopped = false;

  try {
    await waitForShell(page);

    // ── Clean stage (before the recorder starts) ──────────────
    await removeDemoPlugin(page, DEMO_PLUGIN);
    await createVisibleAgentSession(wsDir);
    await openExplorer(page);
    await expectCleanDemoStage(page, DEMO_PLUGIN);

    await installCaptionOverlay(page);
    const input = page.locator(chat.input);
    if (!(await input.isVisible())) {
      await page.locator(layout.chatToggle).click();
    }
    await expect(input).toBeEnabled({ timeout: 10_000 });
    expect(await startDemoRecording(page, { fps: 15, crf: 18 }, interactions)).toBe(true);
    recordedAt = Date.now();

    // ── Describe and build ───────────────────────────────────
    await caption(page, CAMPAIGN_CLIPS['plugin-build'].caption, 4_000);
    await clearCaption(page);

    const pluginPath = path.join(wsDir, PLUGIN_FOLDER);
    const buildStartedAt = Date.now();
    if (REHEARSE) {
      await caption(page, 'Rehearsal: the build step is skipped.', 2_000);
      await clearCaption(page);
    } else {
      await page.locator(chat.input).fill(PLUGIN_PROMPT);
      await clickForDemo(page, page.locator(chat.submitButton), interactions);
      await waitForAgentTurn(page, {
        isComplete: () => fs.existsSync(path.join(pluginPath, 'package.json')),
      });
    }
    const buildFinishedAt = Date.now();

    // ── Install and use ──────────────────────────────────────
    const plugin = readGeneratedPluginApp(pluginPath);
    await installPluginFromFolder(page, { folderPath: pluginPath, plugin, log: interactions });

    const generateReport = page.getByRole('button', { name: 'Generate report' });
    const clickedAt = Date.now();
    await clickForDemo(page, generateReport, interactions, { name: 'Generate report' });

    // The agent chooses the report's wording and markup, so the check anchors
    // on the release tag this workspace was given. If the panel shows the tag,
    // a real report reached the screen.
    const panel = page.locator(layout.activeAppPanel).first();
    await expect(panel).toContainText('v1.0.0', { timeout: 120_000 });
    // A saved report from an earlier run would satisfy the panel check on its
    // own, so require a file written after the click. That is the only proof
    // this click generated the report.
    await expect.poll(() => {
      const file = path.join(wsDir, REPORT_FILE);
      return fs.existsSync(file) && fs.statSync(file).mtimeMs >= clickedAt;
    }, {
      message: 'Generate report must write a fresh report file',
      timeout: 120_000,
    }).toBe(true);

    await caption(page, 'The release checklist is ready to use.', 6_000);
    await clearCaption(page);
    await page.waitForTimeout(2_000);
    const rawResult = await stopRecordingRaw(page, rawPath);
    recordingStopped = true;
    expect(rawResult).toBeTruthy();

    // ── Pace, encode, and validate ───────────────────────────
    const buildStart = (buildStartedAt - recordedAt) / 1000;
    const buildEnd = (buildFinishedAt - recordedAt) / 1000;
    const acceleratedStart = Math.min(buildStart + 8, buildEnd);
    const acceleratedDuration = Math.max(0, buildEnd - acceleratedStart);
    const speed = Math.max(1, Math.min(16, acceleratedDuration / 35));
    const segments = speed > 1
      ? [{
          start: acceleratedStart,
          end: buildEnd,
          speed,
          label: 'TIMELAPSE',
          realElapsedMs: Math.round(acceleratedDuration * 1000),
        }]
      : [];
    await assembleDemo(rawPath, finalPath, segments);
    const reviewSheet = path.join(dir, `${FILE_PREFIX}plugin-build-review.jpg`);
    await createReviewContactSheet(finalPath, reviewSheet);
    const validation = await validateDemoVideo(finalPath, CAMPAIGN_CLIPS['plugin-build'], {
      outputDir: dir,
      visibleClickCount: interactions.visibleClickCount,
    });
    fs.writeFileSync(manifestPath, JSON.stringify({
      clip: CAMPAIGN_CLIPS['plugin-build'],
      rehearsal: REHEARSE,
      rawPath,
      finalPath,
      reviewSheet,
      realBuildElapsedMs: buildFinishedAt - buildStartedAt,
      segments,
      visibleClickCount: interactions.visibleClickCount,
      nativeDialogClickCount: interactions.nativeDialogClickCount,
      validation,
    }, null, 2));
    // A rehearsal has no build, so it can never match the clip profile. The
    // result stays in the manifest, but it must not fail the rehearsal.
    if (!REHEARSE) expect(validation.errors).toEqual([]);
  } finally {
    if (!recordingStopped) {
      await stopRecordingRaw(page, rawPath).catch(() => null);
    }
    await browser.close().catch(() => {});
  }
});
