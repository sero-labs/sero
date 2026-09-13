/**
 * Output optimizer live e2e.
 *
 * Project: agent. Every command below runs through a real model turn, so the
 * plugin's rewrite, capture and compaction hooks run on real bash results.
 *
 * The default run uses a disposable temp profile with the shared e2e model
 * credentials, so it never touches the user's settings. Set
 * `SERO_E2E_REAL_HOME=1` to run against the active profile's `openai-codex`
 * OAuth instead; that path snapshots and restores the optimizer config and
 * status files, because the scenarios overwrite and delete them.
 *
 * Heavy tool categories (tests, builds, linters, package managers) use tiny
 * fixture executables in the workspace. The plugin classifies by command name
 * and compacts the captured output, so a stub binary exercises the real rule
 * without a multi-minute real toolchain run.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeSeroApp,
  configureAgentModel,
  createTempSeroHome,
  disableAllToolsExcept,
  getLlmConfig,
  getLlmCredentialEnvKeys,
  getLlmLaunchEnv,
  launchSeroApp,
  launchWorkflowApp,
  promptAndCollectEvents,
  requireLlmReady,
  sidebar,
  toolEnds,
  toolStarts,
  waitForShell,
  type LlmConfig,
  type TempSeroHome,
} from './helpers';
import type { AgentStreamEvent, SeroSessionInfo, WorkspaceInfo } from '../src/types/ipc';

/** Opt in to the active profile. The default run uses a disposable temp home. */
const REAL_HOME = process.env.SERO_E2E_REAL_HOME === '1';
/** The profile root the real-home path points at, when the operator opts in. */
const REAL_HOME_ROOT = process.env.SERO_E2E_ACTIVE_PROFILE_ROOT ?? path.join(os.homedir(), '.sero-ui');
/** The gate is opt-in: these scenarios spend real money. */
const gate = REAL_HOME ? { skip: false as const, reason: '' } : requireLlmReady();
/** The disposable path needs the shared e2e credentials and their model. */
const llmConfig: LlmConfig | null = REAL_HOME ? null : getLlmConfig();
const MODEL_PROVIDER = process.env.SERO_E2E_LLM_PROVIDER
  ?? (REAL_HOME ? 'openai-codex' : llmConfig?.provider ?? 'openrouter');
const MODEL_ID = process.env.SERO_E2E_LLM_MODEL
  ?? (REAL_HOME ? 'gpt-5.6-luna' : llmConfig?.modelId ?? '');
const THINKING_LEVEL = 'high' as const;
const TURN_TIMEOUT_MS = 240_000;

const ALL_CLASSES = {
  fileReads: true,
  git: true,
  containers: true,
  github: true,
  tests: true,
  builds: true,
  packageManagers: true,
  other: true,
} as const;
type RewriteClass = keyof typeof ALL_CLASSES;

const SYSTEM_PROMPT =
  'You are an automated e2e test agent. Call the bash tool exactly once with the exact command the user provides in JSON, changing nothing. Then answer with only OK.';

let app: ElectronApplication;
let page: Page;
let workspace: WorkspaceInfo;
let workspaceDir: string;
let seroHome: string;
let configPath: string;
let statusPath: string;
let captureRoot: string;
let binDir: string;
let home: TempSeroHome | undefined;
let savedConfig: FileSnapshot | undefined;
let savedStatus: FileSnapshot | undefined;
const sessionPaths: string[] = [];
let configGeneration = 0;

interface FileSnapshot {
  existed: boolean;
  bytes?: Buffer;
}

type BashEnd = Extract<AgentStreamEvent, { type: 'tool_end' }>;

interface TurnResult {
  end: BashEnd;
  details: Record<string, unknown>;
  content: string[];
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);
test.skip(gate.skip, gate.reason);

function writeConfig(options: { enabled?: boolean; classes?: Partial<Record<RewriteClass, boolean>>; notices?: boolean } = {}): void {
  const config = {
    version: 1,
    enabled: options.enabled ?? true,
    rewriteClasses: { ...ALL_CLASSES, ...(options.classes ?? {}) },
    notices: options.notices ?? true,
  };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  // ConfigStore compares mtimeMs+size; a distinct mtime guarantees a re-read
  // even when two writes land in the same millisecond.
  const when = new Date(Date.now() + (++configGeneration) * 1000);
  fs.utimesSync(configPath, when, when);
}

function clearConfig(): void {
  fs.rmSync(configPath, { force: true });
}

/** The exact bytes of a file, and whether it existed at all. */
function snapshotFile(file: string): FileSnapshot {
  try {
    return { existed: true, bytes: fs.readFileSync(file) };
  } catch {
    return { existed: false };
  }
}

/** Put a snapshot back, including removing a file that did not exist before. */
function restoreFile(file: string, saved: FileSnapshot | undefined): void {
  if (!saved) return;
  if (saved.existed && saved.bytes) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, saved.bytes);
  } else {
    fs.rmSync(file, { force: true });
  }
}

async function openSession(name: string, tools: string[] = ['bash'], systemPrompt = SYSTEM_PROMPT): Promise<SeroSessionInfo> {
  const session = await page.evaluate(async ({ wsId, label }) => {
    const created = await window.sero.sessions.create(wsId);
    await window.sero.agent.open(created.id, created.path, wsId);
    await window.sero.sessions.rename(created.id, label);
    return created;
  }, { wsId: workspace.id, label: name });
  sessionPaths.push(session.path);

  const configured = await configureAgentModel(page, session.id, {
    mode: 'cheap',
    provider: MODEL_PROVIDER,
    modelId: MODEL_ID,
  });
  if (!configured.configured) {
    throw new Error(configured.reason ?? `Model ${MODEL_PROVIDER}/${MODEL_ID} is unavailable.`);
  }
  await page.evaluate(async ({ id, level }) => {
    const state = await window.sero.agent.getModelState(id);
    if (state?.availableThinkingLevels.includes(level)) {
      await window.sero.agent.setThinkingLevel(id, level);
    }
  }, { id: session.id, level: THINKING_LEVEL });

  await disableAllToolsExcept(page, session.id, tools, systemPrompt);

  // `window.sero.agent.open` reaches the main process; the renderer's chat
  // panel follows the sidebar selection, so select the session to make the
  // transcript (and its tool cards) visible to UI assertions.
  await page.evaluate(() => window.dispatchEvent(new Event('sero:workspace-changed')));
  const sessionItem = page.locator(sidebar.sessionById(session.id));
  if (await sessionItem.isVisible().catch(() => false)) {
    await sessionItem.click();
  }
  return session;
}

function toolResults(sessionPath: string): Array<Record<string, unknown>> {
  const lines = fs.readFileSync(sessionPath, 'utf8').split('\n').filter(Boolean);
  return lines
    .map((line) => JSON.parse(line) as { message?: { role?: string } })
    .filter((entry) => entry.message?.role === 'toolResult')
    .map((entry) => entry.message as unknown as Record<string, unknown>);
}

function resultFor(sessionPath: string, toolCallId: string): Record<string, unknown> | undefined {
  return toolResults(sessionPath).find((message) => message.toolCallId === toolCallId);
}

function textOf(message: Record<string, unknown> | undefined): string[] {
  const content = message?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((block): block is { type: string; text: string } => (
      typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text'
    ))
    .map((block) => block.text);
}

async function runBash(session: SeroSessionInfo, command: string, prompt?: string): Promise<TurnResult> {
  const instruction = prompt
    ?? `Run this exact bash command: ${JSON.stringify({ command })}. Call bash exactly once, changing nothing. Then answer with only OK.`;
  const turn = await promptAndCollectEvents(page, session.id, instruction, TURN_TIMEOUT_MS);
  const ends = toolEnds(turn.events, 'bash');
  const end = ends[ends.length - 1];
  if (!end) {
    throw new Error(`No bash tool_end. Events: ${turn.events.map((event) => event.type).join(', ')}`);
  }
  const start = toolStarts(turn.events, 'bash').find((candidate) => candidate.tool.toolCallId === end.toolCallId);
  const requested = (start?.tool.input as { command?: unknown } | undefined)?.command;
  expect(requested, 'the model must run the exact requested command').toBe(command);
  const message = resultFor(session.path, end.toolCallId);
  return {
    end,
    details: (end.details ?? {}) as Record<string, unknown>,
    content: textOf(message),
  };
}

function optimization(details: Record<string, unknown>): Record<string, unknown> {
  return (details.optimization ?? {}) as Record<string, unknown>;
}

function rewrite(details: Record<string, unknown>): Record<string, unknown> | undefined {
  return details.rewrite as Record<string, unknown> | undefined;
}

function capture(details: Record<string, unknown>): Record<string, unknown> {
  return (details.capture ?? {}) as Record<string, unknown>;
}

function body(turn: TurnResult): string {
  return turn.content.join('\n');
}

function lockCaptureDir(sessionId: string): void {
  const dir = path.join(captureRoot, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.chmodSync(dir, 0o555);
}

function unlockCaptureDir(sessionId: string): void {
  try {
    fs.chmodSync(path.join(captureRoot, sessionId), 0o755);
  } catch {
    // A missing directory needs no unlock.
  }
}

test.beforeAll(async () => {
  if (REAL_HOME) {
    ({ app, page } = await launchSeroApp({
      seroHome: REAL_HOME_ROOT,
      runtime: 'host',
      env: { SERO_HOST_FIRST: '1' },
    }));
  } else {
    home = createTempSeroHome();
    ({ app, page } = await launchWorkflowApp({
      home,
      runtime: 'host',
      withoutEnv: getLlmCredentialEnvKeys(),
      env: { SERO_HOST_FIRST: '1', ...getLlmLaunchEnv() },
    }));
  }
  await waitForShell(page);

  const resolved = await app.evaluate(() => process.env.SERO_HOME ?? null);
  if (!resolved) throw new Error('The app did not resolve SERO_HOME.');
  seroHome = resolved;
  configPath = path.join(seroHome, 'state', 'output-optimizer', 'config.json');
  statusPath = path.join(seroHome, 'state', 'output-optimizer', 'status.json');
  captureRoot = path.join(seroHome, 'agent', 'captures');

  // The scenarios overwrite and delete the optimizer files. On a real home that
  // is the user's own state, so keep the exact bytes and restore them in cleanup.
  if (REAL_HOME) {
    savedConfig = snapshotFile(configPath);
    savedStatus = snapshotFile(statusPath);
  }

  workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'optimizer-agent-'));
  binDir = path.join(workspaceDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  // Search fixtures: grouped `rg` output needs real matches on disk.
  fs.writeFileSync(path.join(workspaceDir, 'alpha.txt'), 'alpha one\nbeta two\nalpha three\n');
  fs.mkdirSync(path.join(workspaceDir, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, 'nested', 'gamma.txt'), 'alpha four\ngamma\n');
  // Grouped search needs enough matches for grouping to beat the raw bytes.
  const searchDir = path.join(workspaceDir, 'packages', 'optimizer', 'src', 'fixtures');
  fs.mkdirSync(searchDir, { recursive: true });
  for (const moduleName of ['module-alpha', 'module-beta']) {
    const lines = Array.from({ length: 30 }, (_, index) => `alpha match ${index + 1}`);
    fs.writeFileSync(path.join(searchDir, `${moduleName}.txt`), `${lines.join('\n')}\n`);
  }
  fs.writeFileSync(
    path.join(workspaceDir, 'package.json'),
    `${JSON.stringify({ name: 'optimizer-fixture', version: '1.0.0', private: true }, null, 2)}\n`,
  );
  fs.mkdirSync(path.join(workspaceDir, 'apps', 'desktop'), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, 'apps', 'desktop', 'package.json'), '{"name":"desktop-fixture"}\n');
  fs.writeFileSync(path.join(workspaceDir, 'setup.sh'), 'echo setup-ran\n');

  // `read` fixture for the non-shell scenario.
  fs.writeFileSync(path.join(workspaceDir, 'exact.txt'), 'EXACT_SENTINEL_9174\nsecond line\n');

  // Stub toolchain: the plugin classifies by command name, so these exercise
  // the real compaction rules deterministically.
  const stubs: Record<string, string> = {
    vitest: `#!/usr/bin/env bash
for i in $(seq 1 60); do echo " ✓ src/passing-$i.test.ts > case $i (1 ms)"; done
echo "FAIL src/optimizer.test.ts > compacts output"
echo "  ● compacts output"
echo "    expect(received).toBe(expected)"
echo "    src/optimizer.test.ts:42:5"
echo ""
echo "Tests  1 failed | 60 passed (61)"
exit 1
`,
    tsc: `#!/usr/bin/env bash
echo "Compiling 200 files..."
echo "src/optimizer.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'."
echo "Checking 200 files..."
echo "src/optimizer.ts(20,1): warning TS6133: 'unused' is declared but its value is never read."
echo "Compiling 200 files..."
exit 0
`,
    eslint: `#!/usr/bin/env bash
for i in $(seq 1 12); do printf 'packages/optimizer/src/deeply/nested/directory/module-a.ts:%d:5: error rule-a violation %d [rule-a]\\n' "$i" "$i"; done
for i in $(seq 1 8); do printf 'packages/optimizer/src/deeply/nested/directory/module-b.ts:%d:3: warning rule-b caution %d [rule-b]\\n' "$i" "$i"; done
exit 0
`,
    pnpm: `#!/usr/bin/env bash
sub="\${1:-}"
if [ "$sub" = "install" ]; then
  echo "Progress: resolved 1, reused 0, downloaded 0"
  echo "Downloading packages..."
  echo "Done in 1.2s"
  echo "error EACCES: permission denied, open '/root/.cache/x'"
  exit 0
fi
if [ "$sub" = "test" ]; then
  for i in $(seq 1 40); do echo " ✓ case $i"; done
  echo "FAIL src/optimizer.test.ts > compacts output"
  echo "  ● compacts output"
  echo "Tests  1 failed | 40 passed"
  exit 0
fi
echo "pnpm: unknown subcommand $sub" >&2
exit 1
`,
  };
  for (const [name, script] of Object.entries(stubs)) {
    const file = path.join(binDir, name);
    fs.writeFileSync(file, script, 'utf8');
    fs.chmodSync(file, 0o755);
  }

  // A real git history with a long commit message and a porcelain `MM` entry.
  const git = (args: string[]): void => {
    execFileSync('git', args, { cwd: workspaceDir });
  };
  git(['init']);
  git(['config', 'user.email', 'e2e@example.com']);
  git(['config', 'user.name', 'E2E']);
  git(['add', 'alpha.txt', 'nested/gamma.txt', 'package.json']);
  git(['commit', '-m', 'Add optimizer search fixtures', '-m', 'Body line one keeps its detail.\nBody line two stays intact.']);
  // Modify, stage, then modify again so both porcelain columns are set (MM).
  fs.appendFileSync(path.join(workspaceDir, 'package.json'), '\n');
  git(['add', 'package.json']);
  fs.appendFileSync(path.join(workspaceDir, 'package.json'), '\n');

  workspace = await page.evaluate(async (folderPath) => {
    const created = await window.sero.workspace.addFolder(folderPath, 'Output Optimizer E2E');
    await window.sero.workspace.open(created.id);
    window.dispatchEvent(new Event('sero:workspace-changed'));
    return created;
  }, workspaceDir);
});

test.afterAll(async () => {
  try {
    await page.evaluate(async ({ sessionPaths: paths, workspaceId }) => {
      for (const sessionPath of paths) {
        await window.sero.sessions.delete(sessionPath).catch(() => undefined);
      }
      await window.sero.workspace.delete(workspaceId).catch(() => undefined);
    }, { sessionPaths, workspaceId: workspace.id }).catch(() => undefined);
  } finally {
    await closeSeroApp(app).catch(() => undefined);
    if (workspaceDir) fs.rmSync(workspaceDir, { recursive: true, force: true });
    if (REAL_HOME) {
      restoreFile(configPath, savedConfig);
      restoreFile(statusPath, savedStatus);
    } else {
      try { clearConfig(); } catch { /* config may not have been resolved */ }
      if (statusPath) fs.rmSync(statusPath, { force: true });
    }
    home?.cleanup();
  }
});

// ── Opt-in and per-class switches (1–4) ─────────────────────────

test.describe('opt-in and per-class switches', () => {
  test('1,2,3: a profile never enabled runs as written, enabling rewrites and compacts, disabling again reverts without a restart', async () => {
    clearConfig();
    const session = await openSession('optimizer opt-in');

    const never = await runBash(session, 'git status');
    expect(rewrite(never.details)).toBeUndefined();
    expect(optimization(never.details).applied).toBeFalsy();
    expect(body(never)).not.toContain('Output optimizer:');

    writeConfig({ enabled: true });
    const enabled = await runBash(session, 'git status');
    expect(rewrite(enabled.details)?.executed).toContain('rtk git status');
    expect(optimization(enabled.details).applied).toBe(true);

    writeConfig({ enabled: false });
    const disabledAgain = await runBash(session, 'git status');
    expect(rewrite(disabledAgain.details)).toBeUndefined();
    expect(optimization(disabledAgain.details).applied).toBeFalsy();
    expect(body(disabledAgain)).not.toContain('Output optimizer:');
  });

  test('4: a disabled class runs as written while another class still rewrites', async () => {
    const session = await openSession('optimizer per-class');

    writeConfig({ enabled: true, classes: { git: false } });
    const gitDisabled = await runBash(session, 'git status');
    expect(rewrite(gitDisabled.details)).toBeUndefined();

    writeConfig({ enabled: true });
    const fileRead = await runBash(session, 'ls');
    expect(rewrite(fileRead.details)?.executed).toContain('rtk ls');
  });
});

// ── Command rewriting (8–16) ────────────────────────────────────

test.describe('command rewriting', () => {
  test('8,17,19,20,36,58: a supported command is rewritten, keeps the rewrite out of model context, reports the capture and keeps every git path', async () => {
    writeConfig({ enabled: true });
    const session = await openSession('optimizer rewrite supported');
    const turn = await runBash(session, 'git status');

    // 8 — RTK equivalent executed.
    const record = rewrite(turn.details);
    expect(record?.requested).toBe('git status');
    expect(String(record?.executed)).toContain('rtk git status');

    // 36 — every changed path survives compaction.
    expect(body(turn)).toContain('package.json');

    // 19 — compaction omitted bytes, so the capture report names path and size.
    expect(optimization(turn.details).applied).toBe(true);
    expect(body(turn)).toContain('Complete output:');
    expect(body(turn)).toMatch(/Complete output: .+\(\d+B\)/);

    // 20 — the provider payload carries no host metadata.
    for (const key of ['hostPath', 'captureId', 'optimization', 'rewrite']) {
      expect(body(turn)).not.toContain(key);
    }
    // 17 — no rewrite notice in model context.
    expect(body(turn)).not.toContain('Command executed differently');

    // 58 — the host advertises the nested-call capability and an ordinary call is still eligible.
    const captureRecord = capture(turn.details);
    expect(captureRecord.complete).toBe(true);
  });

  test('15: Full details names the requested and executed commands for a rewritten result', async () => {
    writeConfig({ enabled: true });
    const session = await openSession('optimizer rewrite dialog');
    await runBash(session, 'git status');

    await page.evaluate(async ({ id, spath, wsId }) => {
      await window.sero.agent.open(id, spath, wsId);
    }, { id: session.id, spath: session.path, wsId: workspace.id });

    const panel = page.locator('[data-testid="chat-panel"]');
    await panel.locator('button').filter({ hasText: 'bash' }).first().click();
    await page.getByRole('button', { name: /^Full details/ }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Tool Details')).toBeVisible();
    await expect(dialog.getByText('Requested')).toBeVisible();
    await expect(dialog.getByText('git status', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Executed')).toBeVisible();
    await expect(dialog.getByText(/rtk git status/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('16: a result for a command that ran as written has no Executed row', async () => {
    writeConfig({ enabled: true });
    const session = await openSession('optimizer no rewrite dialog');
    await runBash(session, 'seq 1 5');

    const panel = page.locator('[data-testid="chat-panel"]');
    await panel.locator('button').filter({ hasText: 'bash' }).first().click();
    await page.getByRole('button', { name: /^Full details/ }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Tool Details')).toBeVisible();
    await expect(dialog.getByText('Executed')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('9: a command with no RTK equivalent runs exactly as written', async () => {
    writeConfig({ enabled: true });
    const session = await openSession('optimizer no equivalent');
    const turn = await runBash(session, 'echo optimizer-no-equivalent-2814');
    expect(rewrite(turn.details)).toBeUndefined();
    expect(body(turn)).toContain('optimizer-no-equivalent-2814');
  });

  test('11,45: a search command runs unmodified and is grouped by file with full paths and matched lines', async () => {
    writeConfig({ enabled: true });
    const session = await openSession('optimizer search');
    const turn = await runBash(session, 'rg -n alpha packages/optimizer/src/fixtures');

    expect(rewrite(turn.details)).toBeUndefined();
    expect(body(turn)).toContain('matches in 2 files');
    expect(body(turn)).toContain('packages/optimizer/src/fixtures/module-alpha.txt');
    expect(body(turn)).toContain('packages/optimizer/src/fixtures/module-beta.txt');
    expect(body(turn)).toContain('1: alpha match 1');
    expect(body(turn)).not.toContain('…');
  });

  test('12: a non-search command piped into a search command runs unmodified', async () => {
    writeConfig({ enabled: true });
    const session = await openSession('optimizer piped search');
    const turn = await runBash(session, 'cat alpha.txt | grep alpha');
    expect(rewrite(turn.details)).toBeUndefined();
    expect(body(turn)).toContain('alpha one');
  });

  test('13: lossy git history forms run unmodified', async () => {
    writeConfig({ enabled: true });
    const session = await openSession('optimizer lossy git');
    const turn = await runBash(session, 'git log --oneline');
    expect(rewrite(turn.details)).toBeUndefined();
  });

  test('14: machine-readable output runs as written with no rewriting or content filtering', async () => {
    writeConfig({ enabled: true });
    const session = await openSession('optimizer structured');
    const turn = await runBash(session, 'git status --porcelain=v1');
    expect(rewrite(turn.details)).toBeUndefined();
    expect(optimization(turn.details).applied).toBe(false);
    expect(body(turn)).not.toContain('Output optimizer:');
    expect(body(turn)).toContain('package.json');
  });
});

// ── Model context (18,21) ───────────────────────────────────────

test.describe('model context', () => {
  test('18: a command whose output the model received in full carries no Complete output line', async () => {
    writeConfig({ enabled: true });
    const session = await openSession('optimizer full payload');
    const turn = await runBash(session, 'echo short-and-complete-5521');
    expect(body(turn)).toContain('short-and-complete-5521');
    expect(body(turn)).not.toContain('Complete output:');
  });

  test('21: a command that emits colour reaches the payload without escape sequences', async () => {
    writeConfig({ enabled: true });
    const session = await openSession('optimizer ansi');
    const turn = await runBash(session, "printf '\\033[31mred-text-7788\\033[0m\\n'");
    expect(body(turn)).toContain('red-text-7788');
    expect(body(turn)).not.toContain('\u001b');
  });
});

// ── Compaction (33–45) ──────────────────────────────────────────

test.describe('compaction', () => {
  test('33,44: a failing test suite keeps failures and the summary, and the non-zero exit stays visible', async () => {
    // Class rewrite off so the fixture binary runs and the plugin compacts the
    // real output rather than RTK's filtered form.
    writeConfig({ enabled: true, classes: { tests: false } });
    const session = await openSession('optimizer test run');
    const turn = await runBash(session, `${binDir}/vitest run`);

    expect(body(turn)).toContain('FAIL src/optimizer.test.ts > compacts output');
    expect(body(turn)).toContain('Tests  1 failed | 60 passed');
    expect(body(turn)).toContain('src/optimizer.test.ts:42:5');
    // 44 — exit code and failure status remain visible.
    expect(body(turn)).toMatch(/Command exited with code 1/);
  });

  test('34: a build with errors and warnings keeps each error and warning with file and line', async () => {
    writeConfig({ enabled: true, classes: { builds: false } });
    const session = await openSession('optimizer build');
    const turn = await runBash(session, `${binDir}/tsc --noEmit`);

    expect(body(turn)).toContain("src/optimizer.ts(12,5): error TS2322");
    expect(body(turn)).toContain("src/optimizer.ts(20,1): warning TS6133");
    // Progress is dropped.
    expect(body(turn)).not.toContain('Compiling 200 files');
  });

  test('35: a linter groups diagnostics by file and retains counts', async () => {
    writeConfig({ enabled: true, classes: { builds: false } });
    const session = await openSession('optimizer lint');
    const turn = await runBash(session, `${binDir}/eslint .`);

    expect(body(turn)).toContain('12 errors, 8 warnings in 2 files');
    expect(body(turn)).toContain('packages/optimizer/src/deeply/nested/directory/module-a.ts');
    expect(body(turn)).toContain('packages/optimizer/src/deeply/nested/directory/module-b.ts');
    expect(body(turn)).toContain('12:5: error rule-a violation 12');
  });

  test('36: git log keeps every commit id and the full commit message', async () => {
    writeConfig({ enabled: true, classes: { git: false } });
    const session = await openSession('optimizer git log');
    const turn = await runBash(session, 'git log');
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspaceDir, encoding: 'utf8' }).trim();

    expect(body(turn)).toContain(sha);
    expect(body(turn)).toContain('Add optimizer search fixtures');
    expect(body(turn)).toContain('Body line one keeps its detail.');
    expect(body(turn)).toContain('Body line two stays intact.');
    expect(body(turn)).not.toContain('Author: E2E');
  });

  test('37: staged-then-modified porcelain keeps both status columns', async () => {
    writeConfig({ enabled: true, classes: { git: false } });
    const session = await openSession('optimizer porcelain');
    const turn = await runBash(session, 'git status --short');
    expect(body(turn)).toMatch(/MM\s+package\.json/);
    expect(body(turn)).not.toMatch(/^M\s+package\.json$/m);
  });

  test('38: a package manager drops progress and keeps errors', async () => {
    writeConfig({ enabled: true, classes: { packageManagers: false } });
    const session = await openSession('optimizer package manager');
    const turn = await runBash(session, `${binDir}/pnpm install`);

    expect(body(turn)).toContain("error EACCES: permission denied");
    expect(body(turn)).not.toContain('Downloading packages');
    expect(body(turn)).not.toContain('Progress: resolved');
  });

  test('39: output that matches no category reaches the model unchanged', async () => {
    writeConfig({ enabled: true });
    const session = await openSession('optimizer uncategorised');
    const turn = await runBash(session, 'seq 1 5');
    expect(optimization(turn.details).applied).toBe(false);
    expect(body(turn)).not.toContain('Output optimizer:');
    expect(body(turn)).toContain('5');
  });

  test('40: a compound command with cat is preserved verbatim', async () => {
    writeConfig({ enabled: true, classes: { packageManagers: false } });
    const session = await openSession('optimizer compound cat');
    const turn = await runBash(session, `${binDir}/pnpm test && cat package.json`);

    expect(body(turn)).toContain('optimizer-fixture');
    expect(body(turn)).toContain('Tests  1 failed | 40 passed');
    expect(body(turn)).not.toContain('Output optimizer:');
  });

  test('41: a pipeline that ends in a stdin filter is preserved verbatim', async () => {
    writeConfig({ enabled: true, classes: { packageManagers: false } });
    const session = await openSession('optimizer pipe cat');
    const turn = await runBash(session, `${binDir}/pnpm test | cat package.json -`);

    expect(body(turn)).toContain('optimizer-fixture');
    expect(body(turn)).not.toContain('Output optimizer:');
  });

  test('42: a sourced setup script before a test run is preserved verbatim', async () => {
    writeConfig({ enabled: true, classes: { packageManagers: false } });
    const session = await openSession('optimizer source setup');
    const turn = await runBash(session, `source ./setup.sh && ${binDir}/pnpm test`);

    expect(body(turn)).toContain('setup-ran');
    expect(body(turn)).not.toContain('Output optimizer:');
  });

  test('43: cd into a directory then a test run is treated as a test run', async () => {
    writeConfig({ enabled: true, classes: { packageManagers: false } });
    const session = await openSession('optimizer cd test');
    const turn = await runBash(session, `cd apps/desktop && ${binDir}/pnpm test`);

    expect(body(turn)).toContain('Output optimizer: test compaction kept diagnostics');
    expect(body(turn)).not.toContain(' ✓ case 40');
  });
});

// ── Bypass and fail-open (46–49) ────────────────────────────────

test.describe('bypass and fail-open', () => {
  test('46,47: a # no-opt command is neither rewritten nor compacted and the next command is optimised again', async () => {
    writeConfig({ enabled: true });
    const session = await openSession('optimizer bypass');

    const bypassed = await runBash(session, 'git status --short # no-opt');
    expect(rewrite(bypassed.details)).toBeUndefined();
    expect(optimization(bypassed.details).applied).toBeFalsy();
    expect(body(bypassed)).not.toContain('Output optimizer:');

    const next = await runBash(session, 'git status');
    expect(rewrite(next.details)?.executed).toContain('rtk git status');
  });

  test('48,49: an unreadable capture preserves the payload, keeps the rewrite report and continues the session', async () => {
    writeConfig({ enabled: true });
    const session = await openSession('optimizer fail open');
    lockCaptureDir(session.id);
    try {
      let turn = await runBash(session, 'git status');
      // RTK resolution can transiently miss under a full run; retry once so this
      // checks the rewritten-command fail-open path, not the unavailable path.
      if (!rewrite(turn.details)) {
        turn = await runBash(session, 'git status');
      }
      // Fail open: no invented error state, the received payload survives.
      expect(turn.end.isError).toBeFalsy();
      // 49 — the rewrite still reports both commands without rerunning.
      const record = rewrite(turn.details);
      expect(record?.requested).toBe('git status');
      expect(String(record?.executed)).toContain('rtk git status');
      expect(capture(turn.details).complete).not.toBe(true);
    } finally {
      unlockCaptureDir(session.id);
    }

    // The session continued: a later command still runs.
    const after = await runBash(session, 'echo session-continued-1120');
    expect(body(after)).toContain('session-continued-1120');
  });
});

// ── Accounting (50–53) ──────────────────────────────────────────

test.describe('accounting', () => {
  test('50,53: measured calls and bytes increase, and an unchanged run has equal input and compacted bytes', async () => {
    writeConfig({ enabled: true });
    fs.rmSync(statusPath, { force: true });
    const session = await openSession('optimizer accounting');

    const unchanged = await runBash(session, 'seq 1 5');
    const unchangedOptimization = optimization(unchanged.details);
    expect(unchangedOptimization.measured).toBe(true);
    expect(unchangedOptimization.inputBytes).toBe(unchangedOptimization.compactedBytes);

    const changed = await runBash(session, 'git status');
    // A capture write can transiently miss under a full run; retry once so the
    // accounting scenarios assert the steady-state behaviour.
    const changed2 = optimization(changed.details).measured === true ? changed : await runBash(session, 'git status');
    expect(optimization(changed2.details).measured).toBe(true);

    const status = await page.evaluate(async ({ appId, wsId, tool }) =>
      (window as unknown as { sero: { appAgent: { invokeTool: (a: string, b: string, c: string, d: unknown) => Promise<{ details: { savings: Record<string, number> } }> } } })
        .sero.appAgent.invokeTool(appId, wsId, tool, { action: 'state' }),
    { appId: 'output-optimizer', wsId: workspace.id, tool: 'output_optimizer' });

    const savings = status.details.savings;
    expect(savings.measuredCalls).toBeGreaterThanOrEqual(2);
    expect(savings.inputBytes).toBeGreaterThan(0);
    expect(savings.compactedBytes).toBeLessThan(savings.inputBytes);
  });

  test('51: a command with no complete capture is unmeasured and adds no bytes', async () => {
    writeConfig({ enabled: true });
    const session = await openSession('optimizer unmeasured');
    lockCaptureDir(session.id);
    try {
      const turn = await runBash(session, 'git status');
      const record = optimization(turn.details);
      expect(record.measured).toBe(false);
      expect(record.unmeasured).toBe(true);
      expect(record.inputBytes).toBe(0);
      expect(record.compactedBytes).toBe(0);
    } finally {
      unlockCaptureDir(session.id);
    }
  });

  test('54: a fork inherits the captured result and counts it once', async () => {
    writeConfig({ enabled: true });
    const session = await openSession('optimizer fork');
    const turn = await runBash(session, 'git status');
    const captureId = capture(turn.details).captureId;
    expect(captureId).toBeTruthy();

    const fork = await page.evaluate(async (id: string) => window.sero.agent.forkSession(id), session.id);
    sessionPaths.push(fork.path);
    const history = await page.evaluate(
      async ({ id, sessionPath, wsId }) => window.sero.agent.open(id, sessionPath, wsId),
      { id: fork.id, sessionPath: fork.path, wsId: workspace.id },
    );

    const toolMessages = history.messages.filter(
      (message): message is Extract<typeof message, { type: 'tool' }> => message.type === 'tool',
    );
    const retained = toolMessages.filter(
      (message) => (message.details as { capture?: { captureId?: string } } | null)?.capture?.captureId === captureId,
    );
    expect(retained).toHaveLength(1);
    expect((retained[0]?.details as { optimization?: { measured?: boolean } }).optimization?.measured).toBe(true);
  });

  test('52,53: a successful zero-output command counts as measured zero bytes and shows no reduction percentage', async () => {
    writeConfig({ enabled: true });
    fs.rmSync(statusPath, { force: true });
    const session = await openSession('optimizer zero output');
    const turn = await runBash(session, 'true');

    const record = optimization(turn.details);
    expect(record.measured).toBe(true);
    expect(record.unmeasured).toBeFalsy();
    expect(record.inputBytes).toBe(0);
    expect(record.compactedBytes).toBe(0);

    // The settings surface shows no percentage when nothing was measured.
    const panel = page.locator('[data-testid="active-app-panel"]').first();
    await page.evaluate(() => window.__appControl?.openApp('output-optimizer'));
    await expect(panel.locator('[data-app="output-optimizer"]').first()).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText('—', { exact: true })).toBeVisible({ timeout: 10_000 });
  });
});

// ── Non-shell paths (56,57) ─────────────────────────────────────

test.describe('non-shell paths', () => {
  test('56: a file read is exact and untouched', async () => {
    writeConfig({ enabled: true });
    const session = await openSession(
      'optimizer file read',
      ['read'],
      'You are an automated e2e test agent. Call the read tool exactly once with the exact JSON the user provides, then answer with only OK.',
    );
    const turn = await promptAndCollectEvents(
      page,
      session.id,
      `Call read with ${JSON.stringify({ path: 'exact.txt' })} exactly once. Then answer with only OK.`,
      TURN_TIMEOUT_MS,
    );
    const ends = toolEnds(turn.events, 'read');
    const end = ends[ends.length - 1];
    expect(end).toBeTruthy();
    const message = resultFor(session.path, end.toolCallId);
    const text = textOf(message).join('\n');
    expect(text).toContain('EXACT_SENTINEL_9174');
    expect(text).toContain('second line');
    expect(text).not.toContain('Output optimizer:');
  });

  test('57: bash issued from run_code is neither rewritten nor compacted', async () => {
    const session = await openSession(
      'optimizer run code',
      ['run_code', 'bash'],
      'You are an automated e2e test agent. Call the run_code tool exactly once, then answer with only OK.',
    );
    writeConfig({ enabled: true });
    const turn = await promptAndCollectEvents(
      page,
      session.id,
      'Call run_code once with code that calls `await tools.bash({ command: "git status" })` and returns the result text. Then answer with only OK.',
      TURN_TIMEOUT_MS,
    );
    const ends = toolEnds(turn.events, 'run_code');
    const end = ends[ends.length - 1];
    if (!end) {
      test.skip(true, 'The model did not call run_code.');
      return;
    }
    const message = resultFor(session.path, end.toolCallId);
    const text = textOf(message).join('\n');
    // The nested call runs, so its output proves the plugin left it alone: the
    // bash result is present and carries no rewrite or compaction notice.
    expect(text).toContain('package.json');
    expect(text).not.toContain('Output optimizer:');
  });
});

// ── New result vs old (60) ──────────────────────────────────────

test.describe('new session vs old', () => {
  test('60: a new result carries only current behaviour and no stale rewrite notice', async () => {
    writeConfig({ enabled: true });
    const session = await openSession('optimizer new result');
    const turn = await runBash(session, 'git status');
    expect(body(turn)).not.toContain('Command executed differently');
    expect(body(turn)).not.toContain('The model received');
  });
});
