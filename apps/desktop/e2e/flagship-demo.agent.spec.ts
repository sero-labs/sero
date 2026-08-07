/**
 * Public-launch plugin workflow: describe, create, install, and use a plugin
 * through visible controls in one existing Sero process.
 *
 *   SERO_E2E_EXISTING_CDP=9222 npx playwright test e2e/flagship-demo.agent.spec.ts --project=agent
 *
 * Output: ~/Movies/sero-demos/plugin-build.mp4 and the complete raw recording.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { chat, connectToRunningSero, layout } from './helpers';
import { waitForShell } from './helpers/workflow';
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

const EXISTING_CDP = process.env.SERO_E2E_EXISTING_CDP;
const WS_NAME = 'release-checklist-demo';
const PLUGIN_FOLDER = 'release-checklist-plugin';

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

Save the same report as \`release-readiness.md\` in the project folder.

Use the installed plugin-building skill and make the package ready to install from its folder.

Build it, but do not install or commit it.

Proceed without asking follow-up questions.`;

let browser: Browser;
let page: Page;

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function prepareWorkspace(): string {
  const wsDir = path.join(os.homedir(), '.sero-ui', 'workspaces', WS_NAME);
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

async function createVisibleAgentSession(workspacePath: string) {
  const setup = await page.evaluate(async ({ folderPath, name }) => {
    const workspace = await window.sero.workspace.addFolder(folderPath, name);
    const sessions = await window.sero.sessions.list(workspace.id);
    return { workspace, existingSessionIds: sessions.map((session) => session.id) };
  }, { folderPath: workspacePath, name: 'Release Checklist Demo' });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForShell(page);

  const workspaceNode = page.getByTestId(`workspace-node-${setup.workspace.id}`);
  await expect(workspaceNode).toBeVisible({ timeout: 10_000 });
  await workspaceNode.locator('xpath=..').locator('[title="New session"]').click();

  await expect.poll(async () => page.evaluate(async ({ workspaceId, existingSessionIds }) => {
    const sessions = await window.sero.sessions.list(workspaceId);
    return sessions.some((session) => !existingSessionIds.includes(session.id));
  }, { workspaceId: setup.workspace.id, existingSessionIds: setup.existingSessionIds }), {
    message: 'the visible New session action must create a session',
    timeout: 10_000,
  }).toBe(true);

  await expect(page.locator(chat.emptyNoMessages)).toBeVisible({ timeout: 10_000 });
}

function selectFolderInNativeDialog(folderPath: string): void {
  execFileSync('osascript', [
    '-e', 'tell application "System Events"',
    '-e', 'keystroke "g" using {command down, shift down}',
    '-e', 'delay 0.5',
    '-e', `keystroke ${JSON.stringify(folderPath)}`,
    '-e', 'delay 0.5',
    '-e', 'key code 36',
    '-e', 'delay 1',
    '-e', 'key code 36',
    '-e', 'end tell',
  ]);
}

async function installGeneratedPlugin(pluginPath: string): Promise<void> {
  await clickForDemo(
    page,
    page.getByRole('button', { name: 'Open App Store' }),
    interactions,
    { name: 'Open App Store' },
  );
  const installButton = page.getByRole('button', { name: 'Install from folder' });
  await clickForDemo(page, installButton, interactions, { name: 'Install from folder' });
  selectFolderInNativeDialog(pluginPath);
  await expect(
    page.getByRole('heading', { name: 'Release Checklist', exact: true }),
  ).toBeVisible({ timeout: 180_000 });
}

const interactions = createDemoInteractionLog();

test.skip(!EXISTING_CDP, 'plugin workflow recording needs SERO_E2E_EXISTING_CDP');
test.skip(process.platform !== 'darwin', 'native folder selection is automated on macOS');

test('records the complete plugin workflow', async () => {
  test.setTimeout(3_600_000);
  const wsDir = prepareWorkspace();
  ({ browser, page } = await connectToRunningSero({ slowMo: 100 }));

  const dir = demoOutDir();
  const rawPath = path.join(dir, 'plugin-build-raw.mp4');
  const finalPath = path.join(dir, CAMPAIGN_CLIPS['plugin-build'].fileName);
  const manifestPath = path.join(dir, 'plugin-build.json');
  let recordedAt = 0;
  let recordingStopped = false;

  try {
    await waitForShell(page);
    await createVisibleAgentSession(wsDir);
    await installCaptionOverlay(page);
    const input = page.locator(chat.input);
    if (!(await input.isVisible())) {
      await page.locator(layout.chatToggle).click();
    }
    await expect(input).toBeEnabled({ timeout: 10_000 });
    expect(await startDemoRecording(page, { fps: 15, crf: 18 }, interactions)).toBe(true);
    recordedAt = Date.now();

    await caption(page, CAMPAIGN_CLIPS['plugin-build'].caption, 4_000);
    await clearCaption(page);
    await page.locator(chat.input).fill(PLUGIN_PROMPT);

    const buildStartedAt = Date.now();
    await clickForDemo(page, page.locator(chat.submitButton), interactions);
    await expect(page.locator(chat.stopButton)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(chat.stopButton)).toBeHidden({ timeout: 3_000_000 });
    const buildFinishedAt = Date.now();

    const pluginPath = path.join(wsDir, PLUGIN_FOLDER);
    const packageFile = path.join(pluginPath, 'package.json');
    expect(fs.existsSync(packageFile), 'the requested plugin package must exist').toBe(true);
    const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8')) as { sero?: { app?: unknown } };
    expect(packageJson.sero?.app, 'package.json must declare sero.app').toBeTruthy();

    await installGeneratedPlugin(pluginPath);
    const generateReport = page.getByRole('button', { name: 'Generate report' });
    await clickForDemo(page, generateReport, interactions, { name: 'Generate report' });
    const report = page.getByRole('region', { name: 'Release readiness report' });
    await expect(report).toContainText('Latest release', { timeout: 120_000 });
    expect(fs.existsSync(path.join(wsDir, 'release-readiness.md'))).toBe(true);

    await caption(page, 'The release checklist is ready to use.', 6_000);
    await clearCaption(page);
    await page.waitForTimeout(2_000);
    const rawResult = await stopRecordingRaw(page, rawPath);
    recordingStopped = true;
    expect(rawResult).toBeTruthy();

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
    const reviewSheet = path.join(dir, 'plugin-build-review.jpg');
    await createReviewContactSheet(finalPath, reviewSheet);
    const validation = await validateDemoVideo(finalPath, CAMPAIGN_CLIPS['plugin-build'], {
      outputDir: dir,
      visibleClickCount: interactions.visibleClickCount,
    });
    fs.writeFileSync(manifestPath, JSON.stringify({
      clip: CAMPAIGN_CLIPS['plugin-build'],
      rawPath,
      finalPath,
      reviewSheet,
      realBuildElapsedMs: buildFinishedAt - buildStartedAt,
      segments,
      visibleClickCount: interactions.visibleClickCount,
      validation,
    }, null, 2));
    expect(validation.errors).toEqual([]);
  } finally {
    if (!recordingStopped) {
      await stopRecordingRaw(page, rawPath).catch(() => null);
    }
    await browser.close().catch(() => {});
  }
});
