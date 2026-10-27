/**
 * Starts Sero for a tool check run: a fresh onboarded profile whose every
 * model is the stub, and a fresh git workspace on the runtime under test.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp } from '../electron-app';
import { currentRuntimeFromEnv } from '../runtime';
import { createTempSeroHome, type TempSeroHome } from '../seroHome';
import { startProbeStub, type ProbeStub } from '../session-probe';
import { seedStubProvider, STUB_MODEL_ID, STUB_PROVIDER_ID, type StubReply, type StubRequest } from '../stub-model';
import { seedWorkflowProfile, waitForShell } from '../workflow';
import { ScenarioDriver } from './driver';
import { LedgerWriter, ledgerPath } from './ledger';
import type { ToolCallResult, ToolCheckRuntime } from './types';

const DESKTOP_ROOT = path.resolve(__dirname, '../../..');
export const LEDGER_DIR = path.join(DESKTOP_ROOT, 'test-results', 'tool-check');

/**
 * One toolchains folder for every app a run starts, so the browser pack and
 * other managed tools install once. CI caches it by pack version.
 */
export function toolCheckToolchainsDir(): string {
  return process.env.SERO_TOOL_CHECK_TOOLCHAINS ?? path.join(os.tmpdir(), 'sero-tool-check-toolchains');
}

/**
 * Under a test runner the fixed root also holds the host artifacts, so the
 * temp home's toolchains folder links to the shared one. Removing the home
 * removes the link, not the tools.
 */
function linkSharedToolchains(home: string): void {
  const shared = toolCheckToolchainsDir();
  fs.mkdirSync(shared, { recursive: true });
  fs.mkdirSync(path.join(home, '.sero-ui'), { recursive: true });
  fs.symlinkSync(shared, path.join(home, '.sero-ui', 'toolchains'), process.platform === 'win32' ? 'junction' : 'dir');
}

export interface ToolCheckApp {
  runtime: ToolCheckRuntime;
  app: ElectronApplication;
  page: Page;
  stub: ProbeStub;
  driver: ScenarioDriver;
  ledger: LedgerWriter;
  workspaceId: string;
  workspaceDir: string;
  homePath: string;
  /**
   * Answers requests the scenario driver does not claim, such as a Workflow
   * planner's, until the returned function removes it.
   */
  respondWith(responder: Responder): () => void;
  /** Everything Electron main printed so far. */
  mainLog(): string;
  close(): Promise<void>;
}

export type Responder = (request: StubRequest) => StubReply | undefined;

export interface StartOptions {
  /** Answers a request no scenario claims, such as a Room planner's. */
  override?: (request: StubRequest) => StubReply | undefined;
}

function initWorkspace(dir: string): void {
  // A Room gives each member a worktree, and git tools need a repository.
  // .tc-remote.git is the git remote the fixtures put in the workspace.
  fs.writeFileSync(path.join(dir, '.gitignore'), '.sero/\n.tc-remote.git/\n');
  fs.writeFileSync(path.join(dir, 'README.md'), '# Tool check workspace\n');
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=probe@example.com', '-c', 'user.name=Probe', ...args], { cwd: dir, stdio: 'ignore' });
  git('init', '-b', 'main');
  git('add', '-A');
  git('commit', '-m', 'initial');
}

export async function startToolCheckApp(options: StartOptions = {}): Promise<ToolCheckApp> {
  const runtime = currentRuntimeFromEnv() ?? 'host';
  const ledger = new LedgerWriter(ledgerPath(LEDGER_DIR, runtime), runtime);
  const driver = new ScenarioDriver(ledger);
  const responders = new Set<Responder>();
  const answer = (request: StubRequest) => {
    for (const responder of [options.override, ...responders]) {
      const reply = responder?.(request);
      if (reply) return reply;
    }
    // Never the probe stub's own plan, which calls every tool the session has.
    return { text: 'No tool check scenario claims this session.' };
  };
  const stub = await startProbeStub({}, answer, driver);
  let home: TempSeroHome | undefined;
  let workspaceDir = '';
  // A short HOME, as a user has: agent-browser keeps its socket in
  // ~/.agent-browser, and the path must fit in 103 bytes.
  const shortHome = path.join(fs.mkdtempSync(path.join(process.platform === 'win32' ? os.tmpdir() : '/tmp', 'sero-tc-')), 'home');
  let app: ElectronApplication | undefined;
  let log = '';

  const close = async () => {
    try {
      if (app) await closeSeroApp(app);
    } finally {
      try {
        await stub.server.close();
      } finally {
        // SERO_TOOL_CHECK_KEEP_HOME=1 keeps the profile and workspace to look at after a run.
        if (process.env.SERO_TOOL_CHECK_KEEP_HOME === '1') {
          const logFile = path.join(LEDGER_DIR, 'main-process.log');
          fs.writeFileSync(logFile, log);
          console.log(`kept the profile at ${home?.path}, the workspace at ${workspaceDir} and the main process log at ${logFile}`);
        } else {
          home?.cleanup();
          fs.rmSync(path.dirname(shortHome), { recursive: true, force: true });
          if (workspaceDir) fs.rmSync(workspaceDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
        }
      }
    }
  };

  try {
    home = createTempSeroHome();
    linkSharedToolchains(home.path);
    fs.symlinkSync(home.path, shortHome, process.platform === 'win32' ? 'junction' : 'dir');
    // Outside the repository, so the repository's AGENTS.md and skills stay out of every prompt.
    workspaceDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sero-tool-check-')));
    initWorkspace(workspaceDir);
    // The profile sits where the app keeps managed profiles, or the app moves it and the seeds are lost.
    const profile = seedWorkflowProfile(home, { profilePath: path.join(home.path, '.sero-ui', 'profiles', 'tool-check') });
    const stubModel = `${STUB_PROVIDER_ID}/${STUB_MODEL_ID}`;
    const launched = await launchSeroApp({
      seroHome: profile.path,
      runtime,
      env: {
        HOME: shortHome,
        USERPROFILE: shortHome,
        SERO_FIXED_ROOT_OVERRIDE: path.join(home.path, '.sero-ui'),
        // The temp HOME has no git identity.
        GIT_AUTHOR_NAME: 'Probe',
        GIT_AUTHOR_EMAIL: 'probe@example.com',
        GIT_COMMITTER_NAME: 'Probe',
        GIT_COMMITTER_EMAIL: 'probe@example.com',
        SERO_ARCHITECT_MODEL: stubModel,
        SERO_ROOM_MODELS: stubModel,
      },
      seed: (seroHome) => {
        seedStubProvider(seroHome, stub.server.baseUrl, { images: true });
        const tier = { provider: STUB_PROVIDER_ID, modelId: STUB_MODEL_ID };
        fs.writeFileSync(
          path.join(seroHome, 'agent', 'settings.json'),
          JSON.stringify({ sero: { modelTiers: { LOW: tier, MED: tier, HIGH: tier } } }, null, 2),
        );
        // Memory that is set up, as a used profile has. Without it a real model's
        // first chat runs the memory questionnaire and waits for a person.
        const memoryRoot = path.join(seroHome, 'workspaces', 'global');
        fs.mkdirSync(memoryRoot, { recursive: true });
        fs.writeFileSync(path.join(memoryRoot, 'IDENTITY.md'), '# Identity\n\n- **Name:** Sero\n');
        fs.writeFileSync(path.join(memoryRoot, 'USER.md'), '# User\n\n- **Role:** Developer\n');
      },
    });
    app = launched.app;
    for (const stream of [app.process().stdout, app.process().stderr]) stream?.on('data', (chunk: Buffer) => { log += chunk.toString(); });
    await waitForShell(launched.page);
    const workspace = await launched.page.evaluate(
      ({ folder }) => window.sero.workspace.addFolder(folder, 'Tool Check'),
      { folder: workspaceDir },
    );
    if (runtime !== 'host') {
      await launched.page.evaluate(({ id, backend }) => window.sero.workspace.setRuntimeBackend(id, backend), { id: workspace.id, backend: runtime });
    }
    await installToolEndBuffer(launched.page);
    return {
      runtime, app, page: launched.page, stub, driver, ledger,
      workspaceId: workspace.id, workspaceDir, homePath: home.path,
      respondWith: (responder) => {
        responders.add(responder);
        return () => responders.delete(responder);
      },
      mainLog: () => log,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

interface ToolEndBuffer {
  results: Record<string, ToolCallResult>;
  waiting: Record<string, (result: ToolCallResult) => void>;
}

declare global {
  interface Window {
    __toolCheckResults?: ToolEndBuffer;
  }
}

/** Keeps every chat tool result the renderer receives, by call id, for the driver to read. */
async function installToolEndBuffer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const buffer: ToolEndBuffer = { results: {}, waiting: {} };
    window.__toolCheckResults = buffer;
    window.sero.agent.onEvent((event) => {
      if (event.type !== 'tool_end') return;
      const result: ToolCallResult = {
        isError: event.isError,
        text: event.output ?? '',
        images: (event.images ?? []).map((image) => ({ mimeType: image.mimeType, data: image.data })),
        details: event.details ?? undefined,
      };
      buffer.results[event.toolCallId] = result;
      buffer.waiting[event.toolCallId]?.(result);
    });
  });
}

/**
 * Reads a chat call's full result. The renderer can receive it a moment after
 * the next model request starts, so a missing one is waited for, up to 5 seconds.
 */
export function chatResultReader(page: Page): (callId: string) => Promise<ToolCallResult | undefined> {
  return (callId) => page.evaluate((id) => new Promise<ToolCallResult | undefined>((resolve) => {
    const buffer = window.__toolCheckResults!;
    const ready = buffer.results[id];
    if (ready) return resolve(ready);
    const timer = window.setTimeout(() => resolve(undefined), 5_000);
    buffer.waiting[id] = (result) => {
      window.clearTimeout(timer);
      resolve(result);
    };
  }), callId);
}
