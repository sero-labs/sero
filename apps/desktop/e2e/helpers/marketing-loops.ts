/**
 * Harness for the marketing growth-loops e2e run: the local catalog fixture,
 * the scratch clone used as the workspace, and the orchestrator state readers
 * the assertions work from.
 *
 * The spec keeps the assertions; everything mechanical lives here.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

export const SLUGS = [
  'github-star-dashboard',
  'demo-script-generator',
  'community-digest',
  'release-launch-pack',
  'proof-moment-miner',
] as const;
export type Slug = (typeof SLUGS)[number];

export interface OrchestratorIndex {
  loops: { id: string; status: string; title?: string }[];
}

export interface LoopFile {
  id: string;
  title: string;
  status: string;
  plan: { steps: { id: string; title: string }[] };
  triggers: { type: string; schedule?: string; eventSource?: string }[];
  runtime: {
    pendingInput?: {
      id: string;
      questions: { id: string; prompt: string; choices?: { id: string; label: string }[] }[];
    };
  };
}

export interface RunsIndex {
  runs: {
    id: string;
    runNumber: number;
    status: string;
    firedBy?: { source: string; summary: string };
    delivery?: unknown;
  }[];
}

export type LoopRun = RunsIndex['runs'][number];

export function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function git(repoDir: string, args: string[]): string {
  return execFileSync(
    'git',
    ['-C', repoDir, '-c', 'user.email=e2e@sero.test', '-c', 'user.name=sero-e2e', ...args],
    { encoding: 'utf8' },
  ).trim();
}

export function gh(args: string[], cwd?: string): string {
  return execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export const INBOX_SEED = `# Demo scripts inbox

Feature requests for the demo-script-generator loop, one per run. Add a
feature name on its own line under Pending; indent notes beneath it.

## Pending

Durable Orchestrator loops
  Demo 3 of the growth strategy: show this is a durable agent loop, not a
  one-shot prompt. Must show: a plain-English request becoming a step plan,
  the loop activating, a real run with a recovered failure if possible, the
  approval gate before anything external, and the completion signal.
  Audience: developers who already use coding agents.

Sero builds itself a plugin
  Demo 1 / flagship: ask Sero for a release-checklist plugin, the agent
  builds it, the human reviews and approves, the plugin UI appears inside
  Sero and produces a release readiness report. The review/approval moment
  must be a visible beat.

## Processed

(entries move here with the date they were handled)
`;

/** Stage the five local loop drafts as a `file://` catalog repo. */
export function stageCatalogFixture(loopsSrcDir: string): string {
  const fixtureRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marketing-catalog-'));
  execFileSync('git', ['init', '-q', '-b', 'main', fixtureRepoDir]);
  fs.writeFileSync(
    path.join(fixtureRepoDir, 'catalog.json'),
    JSON.stringify({ version: 1, name: 'Sero growth loops (local drafts)', entries: [...SLUGS] }, null, 2),
  );
  for (const slug of SLUGS) {
    const dir = path.join(fixtureRepoDir, 'loops', slug);
    fs.mkdirSync(dir, { recursive: true });
    for (const file of ['catalog.json', 'definition.json']) {
      fs.copyFileSync(path.join(loopsSrcDir, slug, file), path.join(dir, file));
    }
  }
  git(fixtureRepoDir, ['add', '--all']);
  git(fixtureRepoDir, ['commit', '-q', '-m', 'growth loop drafts']);
  return fixtureRepoDir;
}

/**
 * Scratch workspace: a real clone of the repo on the campaign branch, reset to
 * the remote so each pass starts from a known tree.
 */
export function prepareScratchWorkspace(options: {
  seroHome: string;
  marker: string;
  repoSlug: string;
  branch: string;
}): { wsDir: string; stateDir: string } {
  const wsDir = path.join(options.seroHome, 'workspaces', options.marker);
  if (fs.existsSync(path.join(wsDir, '.git'))) {
    git(wsDir, ['fetch', 'origin', options.branch]);
    git(wsDir, ['checkout', options.branch]);
    git(wsDir, ['reset', '--hard', `origin/${options.branch}`]);
    git(wsDir, ['clean', '-fd', 'docs/marketing']);
    fs.rmSync(path.join(wsDir, '.sero'), { recursive: true, force: true });
  } else {
    fs.mkdirSync(path.dirname(wsDir), { recursive: true });
    // Blobless partial clone: full history for range/tag walks, blobs on demand.
    execFileSync('git', [
      'clone', '-q', '--filter=blob:none', '--branch', options.branch,
      `https://github.com/${options.repoSlug}.git`, wsDir,
    ]);
  }

  // The repo does not gitignore .sero/, so exclude it locally: otherwise the
  // orchestrator's own state churn shows up in git status (tripping the loops'
  // drafts-only side-effect audits) and checkpoint commits would sweep it up.
  fs.mkdirSync(path.join(wsDir, '.git', 'info'), { recursive: true });
  fs.writeFileSync(path.join(wsDir, '.git', 'info', 'exclude'), '.sero/\n');

  return { wsDir, stateDir: path.join(wsDir, '.sero', 'apps', 'orchestrator') };
}

export interface MarketingLoopsHarness {
  wsFile(relativePath: string): string;
  listMd(relativeDir: string, exclude?: string[]): string[];
  loopFile(loopId: string): LoopFile | null;
  runsIndex(loopId: string): RunsIndex | null;
  orchestratorIndex(): OrchestratorIndex | null;
  invoke(params: Record<string, unknown>): Promise<Record<string, unknown>>;
  shot(name: string): Promise<void>;
  commitOutputs(message: string): void;
  waitRunSettled(
    loopId: string,
    match: (run: LoopRun) => boolean,
    timeoutMs: number,
  ): Promise<LoopRun>;
}

export function createMarketingLoopsHarness(context: {
  page: Page;
  workspaceId: string;
  wsDir: string;
  stateDir: string;
  shotsDir: string;
}): MarketingLoopsHarness {
  const { page, workspaceId, wsDir, stateDir, shotsDir } = context;

  const wsFile = (relativePath: string) => path.join(wsDir, relativePath);

  const loopFile = (loopId: string) =>
    readJson<LoopFile>(path.join(stateDir, 'loops', loopId, 'loop.json'));
  const runsIndex = (loopId: string) =>
    readJson<RunsIndex>(path.join(stateDir, 'loops', loopId, 'runs', 'index.json'));

  const invoke = async (params: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const result = await page.evaluate(
      ({ id, toolParams }) =>
        window.sero.appAgent.invokeTool('orchestrator', id, 'orchestrator', toolParams),
      { id: workspaceId, toolParams: params },
    );
    return ((result as { details?: Record<string, unknown> })?.details ?? {}) as Record<string, unknown>;
  };

  /**
   * If the loop parked on the dirty-workspace preflight choice, answer
   * "run here" (preferring the don't-ask-again variant) so runs proceed in the
   * scratch clone. Any OTHER pending question is surfaced as a failure — these
   * loops are authored to run without human input when their inputs exist.
   */
  const answerDirtyPreflight = async (loopId: string): Promise<void> => {
    const parked = loopFile(loopId)?.runtime.pendingInput;
    if (!parked) return;
    const question = parked.questions[0];
    if (!/uncommitted change|dirty/i.test(question?.prompt ?? '')) {
      throw new Error(`Loop ${loopId} parked on an unexpected question: ${question?.prompt}`);
    }
    const choice =
      question.choices?.find((c) => /don't ask again/i.test(c.label)) ??
      question.choices?.find((c) => /run here/i.test(c.label));
    expect(choice, `no run-here choice among: ${JSON.stringify(question.choices)}`).toBeTruthy();
    const answered = await invoke({
      action: 'answer_input',
      loopId,
      requestId: parked.id,
      answersJson: JSON.stringify([{ questionId: question.id, choiceId: choice!.id }]),
    });
    expect(answered.ok, String(answered.error ?? '')).not.toBe(false);
  };

  return {
    wsFile,
    listMd(relativeDir: string, exclude: string[] = []): string[] {
      const dir = wsFile(relativeDir);
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !exclude.includes(f));
    },
    loopFile,
    runsIndex,
    orchestratorIndex: () => readJson<OrchestratorIndex>(path.join(stateDir, 'index.json')),
    invoke,
    async shot(name: string): Promise<void> {
      await page.screenshot({ path: path.join(shotsDir, name), fullPage: false });
    },
    /** Local checkpoint commit so the next activation preflights a clean tree. Never pushed. */
    commitOutputs(message: string): void {
      git(wsDir, ['add', '--all']);
      try {
        git(wsDir, ['commit', '-q', '-m', `e2e checkpoint: ${message}`]);
      } catch {
        /* nothing to commit */
      }
    },
    /** Wait until the given run predicate matches a settled run; keep answering the dirty preflight. */
    async waitRunSettled(loopId, match, timeoutMs) {
      await expect
        .poll(
          async () => {
            await answerDirtyPreflight(loopId);
            const run = runsIndex(loopId)?.runs.find(match);
            return run ? run.status : 'no-run-yet';
          },
          { timeout: timeoutMs, intervals: [5_000] },
        )
        .toMatch(/completed|blocked|failed/);
      return runsIndex(loopId)!.runs.find(match)!;
    },
  };
}
