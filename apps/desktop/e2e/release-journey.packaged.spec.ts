/**
 * The packaged-release journey (issue #635).
 *
 * Every other spec launches the development tree, so a passing run says nothing
 * about the artifact a user installs. This one launches the unpacked build that
 * `pnpm --filter @sero/desktop pack` produces, proves it is the packaged app,
 * and runs one real shell task through its own runtime.
 *
 * The pack directory is platform-specific and a local build is unsigned, so this
 * is not a per-PR gate: `pnpm --filter @sero/desktop e2e:packaged` builds the
 * directory and then runs this spec.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  STUB_MODEL_ID,
  STUB_PROVIDER_ID,
  closeSeroApp,
  createTempSeroHome,
  launchSeroApp,
  seedStubProvider,
  startProbeStub,
  waitForShell,
  type ProbeStub,
  type TempSeroHome,
} from './helpers';
import { seedWorkflowProfile } from './helpers/workflow';

const DESKTOP_ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(DESKTOP_ROOT, 'release');
/** The task text that marks the probe session, so its plan answers only this run. */
const TASK = 'release-journey';
const EXPECTED = 'packaged-runtime-ok';

/** The executable an unpacked build leaves behind, by platform. */
function packagedCandidates(): string[] {
  return [
    path.join(RELEASE_DIR, 'mac-arm64', 'Sero.app', 'Contents', 'MacOS', 'Sero'),
    path.join(RELEASE_DIR, 'mac', 'Sero.app', 'Contents', 'MacOS', 'Sero'),
    path.join(RELEASE_DIR, 'linux-unpacked', 'sero'),
    path.join(RELEASE_DIR, 'win-unpacked', 'Sero.exe'),
  ];
}

function findPackagedApp(): string | null {
  const override = process.env.SERO_E2E_PACKAGED_APP;
  if (override) return fs.existsSync(override) ? override : null;
  return packagedCandidates().find((candidate) => fs.existsSync(candidate)) ?? null;
}

const packagedApp = findPackagedApp();
test.skip(
  !packagedApp,
  'No packaged app found. Run `pnpm --filter @sero/desktop pack`, or set SERO_E2E_PACKAGED_APP.',
);

test.describe.configure({ mode: 'serial' });

let app: ElectronApplication;
let page: Page;
let stub: ProbeStub;
let home: TempSeroHome;
let workspaceId: string;

test.beforeAll(async () => {
  // One bash call, then a sentence. The task is a single echo, so the assertion is
  // about the packaged app's runtime reaching a shell, not about model judgement.
  stub = await startProbeStub({
    [TASK]: [{ tool: 'bash', arguments: { command: `echo ${EXPECTED}` } }],
  });
  home = createTempSeroHome();
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-packaged-'));
  const profile = seedWorkflowProfile(home, {
    profilePath: path.join(home.path, '.sero-ui', 'profiles', 'packaged'),
  });
  ({ app, page } = await launchSeroApp({
    executablePath: packagedApp ?? undefined,
    seroHome: profile.path,
    runtime: 'host',
    env: {
      HOME: home.path,
      USERPROFILE: home.path,
      SERO_FIXED_ROOT_OVERRIDE: path.join(home.path, '.sero-ui'),
    },
    seed: (seroHome) => {
      seedStubProvider(seroHome, stub.server.baseUrl);
    },
  }));
  await waitForShell(page);
  const workspace = await page.evaluate(
    ({ folder }) => window.sero.workspace.addFolder(folder, 'Packaged'),
    { folder: workspaceDir },
  );
  workspaceId = workspace.id;
});

test.afterAll(async () => {
  if (app) await closeSeroApp(app);
  await stub?.server.close();
  home?.cleanup();
});

test('runs the packaged artifact, not the development tree', async () => {
  const identity = await app.evaluate(({ app: electronApp }) => ({
    isPackaged: electronApp.isPackaged,
    version: electronApp.getVersion(),
    resourcesPath: process.resourcesPath,
  }));
  // The whole point of this spec: a development launch would report false here.
  expect(identity.isPackaged).toBe(true);
  expect(identity.resourcesPath).toContain('Sero');
  expect(identity.version).toMatch(/^\d+\.\d+\.\d+/);
});

test('completes one real shell task through its own runtime', async () => {
  // Pin the stub model on this session. Tier settings leave the session on the
  // first real provider, which makes the run depend on a key it must not need.
  const session = await page.evaluate(async ({ workspaceId, provider, modelId }) => {
    const created = await window.sero.sessions.create(workspaceId);
    await window.sero.agent.open(created.id, created.path, workspaceId);
    await window.sero.agent.setModel(created.id, provider, modelId);
    return created;
  }, { workspaceId, provider: STUB_PROVIDER_ID, modelId: STUB_MODEL_ID });

  // Race the prompt against a short timer so an immediate rejection is reported
  // instead of being swallowed, while a running turn is left alone.
  const promptOutcome = await page.evaluate(async ({ id, text }) => {
    const pending = 'pending';
    const timer = new Promise<string>((resolve) => { window.setTimeout(() => resolve(pending), 10_000); });
    const turn = window.sero.agent.prompt(id, text, undefined, `packaged-${Date.now()}`)
      .then(() => 'settled', (error: unknown) => (error instanceof Error ? error.message : String(error)));
    return Promise.race([turn, timer]);
  }, { id: session.id, text: TASK });
  // The prompt text is the stub's plan key, so it is the task name exactly.

  const probed = () => [...stub.sessions.values()].find((candidate) => candidate.key.includes(TASK));
  // Report the stub's own view, so a failure says whether the app never reached the
  // provider or reached it and the session did not finish.
  await page.waitForTimeout(5_000);
  const modelState = await page.evaluate(async (id) => {
    const state = await window.sero.agent.getModelState(id);
    return {
      providers: (state?.availableModels ?? []).map((group) => `${group.provider}:${group.models.length}`),
      model: state?.model ? `${state.model.provider}/${state.model.modelId}` : null,
    };
  }, session.id);
  expect(
    stub.server.requests.length,
    `the packaged app never reached the stub provider (prompt: ${promptOutcome}; models: ${JSON.stringify(modelState)})`,
  ).toBeGreaterThan(0);
  await expect.poll(() => probed()?.done ?? false, { timeout: 120_000, intervals: [1_000] }).toBe(true);
  const bash = probed()!.outcomes.find((outcome) => outcome.tool === 'bash');
  // The echoed text is the proof the packaged runtime ran it, so the failure
  // message carries what the probe recorded.
  expect(`${bash?.kind}: ${bash?.detail}`, JSON.stringify(bash)).toContain(EXPECTED);
});
