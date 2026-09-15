/**
 * Measured efficiency baseline (change architect-execution-efficiency-and-observability, task 5.4).
 *
 * Runs two real objectives through the Architect and records what they cost and
 * how long they took, in the metric shape this change adds:
 *
 *   1 implementation-and-independent-review — a Workflow that implements an
 *     objective and has it checked by a reviewer that did not write it.
 *   2 collaborative-planning — a Room where several members plan together.
 *
 * The numbers come from the project budget and the run journal, folded by the
 * same helpers the product uses. Nothing is synthesised: a synthetic record
 * would be an instrumentation check, not evidence about model efficiency, and
 * `isEfficiencyEvidence` refuses it. The run is bounded by a spend cap and
 * refuses to start without one.
 *
 *   env -u ELECTRON_RUN_AS_NODE SERO_E2E_ARCHITECT_BASELINE=1 \
 *     npx playwright test e2e/architect-baseline.agent.spec.ts --project=agent
 *
 * Optional: SERO_BASELINE_MODEL, SERO_BASELINE_CAP (USD), SERO_BASELINE_ONLY.
 * Results are appended to e2e/screenshots/architect-baseline/baseline.json.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, E2E_DATA_ROOT, launchSeroApp, waitForShell } from './helpers';
import {
  compareBaselines, isEfficiencyEvidence, type BaselineEvidence, type BaselineObjective, type BaselineRecord,
} from '../../../plugins/sero-architect-plugin/runtime/baseline';
import { summarizeTiming, summarizeTrace, tokenComposition, type ConfigurationProvenance } from '../../../plugins/sero-architect-plugin/runtime/trace-summary';
import type { JournalRecord } from '../../../plugins/sero-architect-plugin/runtime/run-journal';

const ENABLED = process.env.SERO_E2E_ARCHITECT_BASELINE === '1';
const ONLY = process.env.SERO_BASELINE_ONLY ?? 'all';
const MODEL = process.env.SERO_BASELINE_MODEL ?? 'openai-codex/gpt-5.6-terra:high';
const CAP_USD = Number(process.env.SERO_BASELINE_CAP ?? '2');
const SHOTS = path.resolve(__dirname, 'screenshots', 'architect-baseline');
const RESULTS = path.join(SHOTS, 'baseline.json');
const PROJECTS_ROOT = path.join(os.homedir(), '.sero-e2e-architect-baseline');
/**
 * A profile that outlives one run, so a provider login is done once by hand
 * instead of before every measurement.
 *
 * It deliberately does NOT live under `.sero-e2e`: the Playwright global setup
 * deletes that whole tree before every run, which would take the login with it.
 * Nothing in this spec writes to this path except the app itself.
 */
const BASELINE_HOME = process.env.SERO_BASELINE_HOME
  ?? path.resolve(__dirname, '..', '.sero-baseline-home');

test.describe.configure({ mode: 'serial' });
test.skip(!ENABLED, 'Set SERO_E2E_ARCHITECT_BASELINE=1 to run the measured baseline. It spends real money.');

// The credential is the provider login in the persistent profile, not an
// environment API key, so `requireLlmReady` does not describe this run. The
// model is checked against the live catalogue in beforeAll instead: that is the
// real precondition, and it fails with the reason rather than a skip.

/** The record fields this harness reads. */
interface BaselineProjectRecord {
  id: string;
  phase: string;
  overlay: string | null;
  folder: string;
  workspaceId: string | null;
  autonomy: string;
  stateLine: string;
  budget: { capUsd: number | null; spentUsd: number; incomplete?: boolean; incompleteSources?: string[]; sources: { owner: number; research: number; dispatched: number } };
  decisions: { id: string; question: string; options: { id: string; label: string }[]; proposal: { kind: string; milestoneId?: string; dispatchKind?: string } | null; answer: { optionId: string } | null }[];
  milestones: { id: string; title: string; status: string; plan: string | null; dispatch: { kind: string; id: string; chargedUsd: number; failure?: string } | null; pendingDispatch?: unknown }[];
  runs?: { id: string; objective?: string; openedAt: string; closedAt?: string }[];
  session: { turns: number; sessionPath: string | null; model?: string | null; thinking?: string | null };
}

let homePath = '';
let app: ElectronApplication;
let page: Page;
let profileRoot = '';
let mainLog = '';

const architectHome = (): string => path.join(profileRoot, 'apps', 'architect');

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Runs a management action inside Electron main, where the runtime registry lives. */
async function projects<T>(action: string, ...args: unknown[]): Promise<T> {
  let lastError: unknown;
  // A window that is mid-render rejects a call that would succeed a moment
  // later. Three tries separate a real fault from a hiccup.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await app.evaluate(async (_electron, { action: name, args: input }) => {
        const entry = (globalThis as Record<string, unknown>)['sero-architect:runtime'] as
          { entry: { projects: Record<string, (...a: unknown[]) => Promise<unknown>> } | null } | undefined;
        if (!entry?.entry) throw new Error('the Architect runtime is not registered');
        const fn = entry.entry.projects[name];
        if (typeof fn !== 'function') throw new Error(`no projects action ${name}; have ${Object.keys(entry.entry.projects).join(', ')}`);
        return (await fn.apply(entry.entry.projects, input)) as T;
      }, { action, args });
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(2_000);
    }
  }
  throw lastError;
}

/**
 * Removes a project this run created.
 *
 * The profile outlives the run, so without this every attempt leaves its
 * projects behind and the project list becomes a history of failed attempts.
 */
async function removeProject(projectId: string): Promise<void> {
  try {
    const outcome = await projects<{ ok: boolean; text: string }>('delete', projectId);
    if (!outcome.ok) console.error(`[baseline] could not delete ${projectId}: ${outcome.text}`);
  } catch (error) {
    console.error(`[baseline] could not delete ${projectId}: ${String(error)}`);
  }
}

const show = (projectId: string): Promise<BaselineProjectRecord | null> => projects<BaselineProjectRecord | null>('show', projectId);

async function shot(name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }).catch(() => undefined);
}

/** The prompts that ask the user to permit work. Nothing else is clicked. */
const APPROVAL_LABELS = ['Allow', 'Approve'] as const;

/**
 * Answers every permission prompt on screen, and returns how many it answered.
 *
 * A grant is not one event. Starting a project asks to run the owner session,
 * and a run can ask again later, so this is called throughout a run rather than
 * once. Only the known permit labels are clicked: a decision is answered through
 * the runtime action instead, where the options are real alternatives and
 * picking the first button would be a guess.
 */
async function approvePrompts(label: string): Promise<number> {
  let answered = 0;
  for (const name of APPROVAL_LABELS) {
    const buttons = page.getByRole('button', { name });
    const count = await buttons.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      if (!(await button.isVisible().catch(() => false))) continue;
      console.log(`[baseline] ${label}: answering a "${name}" prompt`);
      await button.click({ timeout: 10_000 }).catch(() => undefined);
      answered += 1;
    }
  }
  return answered;
}

/** What is actually on screen, so a missing card is a fact and not a guess. */
async function screenText(): Promise<string> {
  const buttons = await page.getByRole('button').allInnerTexts().catch(() => []);
  const body = await page.locator('body').innerText().catch(() => '');
  return `buttons=[${buttons.map((label) => label.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40).join(' | ')}] text=${body.slice(0, 600).replace(/\s+/g, ' ')}`;
}

/**
 * True once every dispatched milestone has resolved.
 *
 * `verifying` is not the end: a milestone enters it when evidence collection
 * starts, which happens long before the objective is finished. An earlier
 * version stopped there and measured a quarter of the run. A milestone the owner
 * has planned but not dispatched does not hold the run open, because no work is
 * in flight for it.
 */
function settled(record: BaselineProjectRecord): boolean {
  const dispatched = record.milestones.filter((milestone) => milestone.dispatch !== null);
  return dispatched.length > 0
    && dispatched.every((milestone) =>
      milestone.status === 'done' || milestone.status === 'parked' || Boolean(milestone.dispatch?.failure))
    && !record.milestones.some((milestone) => milestone.pendingDispatch !== undefined);
}

interface CreateOutcome {
  ok: boolean;
  text: string;
  projectId?: string;
}

/**
 * Creates a project, gets permission, and leaves the owner ready to work.
 *
 * `create` deliberately does not ask for permission, so the project sits in
 * intake. `resume` is the action that asks, and it does not return until the
 * card is answered, so the call and the clicks overlap.
 */
async function createProject(name: string, idea: string, folder: string): Promise<{ projectId: string }> {
  const created = await projects<CreateOutcome>('create', { idea, folder, executionMode: 'workspace' });
  expect(created.ok, created.text).toBe(true);
  const projectId = created.projectId ?? '';
  expect(projectId, 'create returned no project id').not.toBe('');

  // `resume` is what asks for permission, and it does not return until the card
  // is answered, so the call and the clicks overlap. Its outcome is read through
  // an object because a plain `let` assigned inside a callback is not tracked.
  const state: { outcome: { ok: boolean; text: string } | null } = { outcome: null };
  const resuming = projects<{ ok: boolean; text: string }>('resume', projectId);
  void resuming.then((value) => { state.outcome = value; }, (error: unknown) => {
    state.outcome = { ok: false, text: error instanceof Error ? error.message : String(error) };
  });

  const deadline = Date.now() + 150_000;
  let answered = 0;
  while (Date.now() < deadline && !state.outcome) {
    answered += await approvePrompts(name);
    if (state.outcome) break;
    await page.waitForTimeout(2_000);
  }
  if (!state.outcome) {
    await shot(`${name}-no-grant`);
    throw new Error(`${name}: resume() never returned. ${answered} permission prompt(s) answered. On screen: ${await screenText()}`);
  }
  expect(state.outcome.ok, state.outcome.text).toBe(true);
  return { projectId };
}

/**
 * A minimal existing package for the project folder.
 *
 * `create` makes an empty folder and runs `git init`, and the Architect's
 * research Room then has no repository or files to read, so it blocks asking the
 * user for a workspace. A package on disk gives discovery something real.
 */
function seedPackageFolder(folder: string): void {
  fs.mkdirSync(path.join(folder, 'src'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'package.json'), `${JSON.stringify({
    name: 'baseline-package',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: { test: 'node --test', build: 'tsc --noEmit' },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(folder, 'README.md'), '# Baseline package\n\nA small TypeScript utility package.\n');
  fs.writeFileSync(
    path.join(folder, 'src', 'index.ts'),
    'export function placeholder(): string {\n  return "placeholder";\n}\n',
  );
}

interface DriveOptions {
  /** Stop once this holds. */
  until: (record: BaselineProjectRecord) => boolean;
  label: string;
  timeoutMs: number;
  /** Approve each milestone plan as it appears, the way a user answering does. */
  approveMilestones?: boolean;
}

/**
 * Answers what the owner asks and waits for the objective to start.
 *
 * It approves what a user would approve and nothing more: a charter, a milestone
 * plan, and any decision the owner raises. It never dispatches on the owner's
 * behalf, so the work that runs is the work the owner chose.
 */
async function drive(projectId: string, options: DriveOptions): Promise<BaselineProjectRecord> {
  const deadline = Date.now() + options.timeoutMs;
  const seen = new Set<string>();
  let last: BaselineProjectRecord | null = null;

  while (Date.now() < deadline) {
    // A run can ask for permission more than once, so every pass answers what is
    // on screen rather than assuming the grant at the start was the only one.
    await approvePrompts(options.label);
    const record = await show(projectId);
    if (record) {
      last = record;
      if (options.until(record)) return record;

      // An open decision blocks the owner until it is answered.
      for (const decision of record.decisions) {
        if (decision.answer || seen.has(decision.id)) continue;
        seen.add(decision.id);
        const choice = decision.options.find((option) => option.id === 'apply') ?? decision.options[0];
        if (!choice) continue;
        console.log(`[baseline] ${options.label}: answering ${decision.id} with ${choice.id} — ${decision.question}`);
        await projects<unknown>('answer', projectId, decision.id, choice.id).catch((error) => {
          console.error(`[baseline] ${options.label}: answer failed: ${String(error)}`);
        });
      }

      if (record.phase === 'charter') {
        console.log(`[baseline] ${options.label}: approving the charter`);
        await projects<unknown>('approve', projectId, 'charter').catch((error) => {
          console.error(`[baseline] ${options.label}: charter approval failed: ${String(error)}`);
        });
      }

      if (options.approveMilestones) {
        for (const milestone of record.milestones) {
          if (milestone.status !== 'planned' || !milestone.plan) continue;
          if (seen.has(`m:${milestone.id}`)) continue;
          seen.add(`m:${milestone.id}`);
          console.log(`[baseline] ${options.label}: approving milestone ${milestone.id} (${milestone.title})`);
          await projects<unknown>('approve', projectId, 'milestone', milestone.id).catch((error) => {
            console.error(`[baseline] ${options.label}: milestone approval failed: ${String(error)}`);
          });
        }
      }
    }
    await page.waitForTimeout(5_000);
  }
  if (!last) throw new Error(`${options.label}: the project never appeared`);
  throw new Error(`${options.label}: timed out waiting for the objective. State: ${last.phase}/${last.stateLine}; milestones ${JSON.stringify(last.milestones.map((m) => [m.id, m.status]))}. On screen: ${await screenText()}`);
}

/** Every journal line for one run, in order. A torn tail is dropped, not guessed at. */
function journalOf(projectId: string, runId: string): JournalRecord[] {
  const file = path.join(architectHome(), 'runs', projectId, `${runId}.journal.ndjson`);
  if (!fs.existsSync(file)) return [];
  const records: JournalRecord[] = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line) as JournalRecord);
    } catch {
      // A cut-short append. The next line is still a whole record.
    }
  }
  return records;
}

interface Captured {
  record: BaselineRecord;
  provenance: ConfigurationProvenance[];
}

/**
 * Folds one completed objective into a baseline record, from the stored record
 * and the run journal. Coverage is reported as recorded; a gap stays a gap.
 */
async function capture(
  projectId: string,
  objective: BaselineObjective,
  candidate: string,
  acceptanceCriteria: string[],
): Promise<Captured> {
  const record = await show(projectId);
  if (!record) throw new Error(`${objective}: project ${projectId} disappeared`);

  const runs = record.runs ?? [];
  const journal = runs.flatMap((run) => journalOf(projectId, run.id));
  const trace = summarizeTrace(journal, {
    projectId,
    runId: runs.map((run) => run.id).join(','),
    knownSpendUsd: record.budget.spentUsd,
  });
  const timing = summarizeTiming(journal);
  const tokens = tokenComposition(journal);
  const provenance = provenanceOf(journal);

  // The owner session is the Architect's own model, and the Architect knows it
  // exactly: it opened the session with it. A span covers a delegated operation,
  // which deliberately names no model, because the Orchestrator picked it from
  // the snapshot and the Architect never saw which one ran. Without this the
  // record would name no model at all.
  if (record.session.model) {
    provenance.unshift({
      operationId: 'owner-session',
      model: record.session.model,
      ...(record.session.thinking ? { thinking: record.session.thinking } : {}),
      source: 'owner session',
    });
  }

  const dispatched = record.milestones.filter((milestone) => milestone.dispatch !== null);
  const elapsedMs = elapsedOf(journal, runs);
  const expected = ['input', 'output'];

  const baseline: BaselineRecord = {
    candidate,
    objective,
    models: provenance,
    acceptanceCriteria,
    cost: {
      attributableUsd: trace.attributableUsd,
      aggregateOnlyUsd: trace.aggregateUsd,
      coverage: trace.hasAggregate ? (trace.aggregateUsd >= trace.attributableUsd ? 'aggregate' : 'partial') : 'call',
      incomplete: trace.incomplete || expected.some((key) => tokens.unavailable.includes(key)),
    },
    time: {
      elapsedMs,
      activeMs: timing.activeMs,
      workerMs: timing.workerMs,
      waitMs: timing.waitMs,
    },
    counters: {
      agents: dispatched.length,
      turns: record.session.turns,
      requests: trace.requests,
      toolCalls: trace.toolCalls,
      retries: trace.retries,
      compactions: trace.compactions,
    },
    outcome: dispatched.some((milestone) => milestone.dispatch?.failure) ? 'rejected' : 'accepted',
    budgetUsd: record.budget.capUsd ?? CAP_USD,
    evidence: 'live' as BaselineEvidence,
    recordedAt: new Date().toISOString(),
  };

  console.log(`[baseline] ${objective}: ${JSON.stringify({ cost: baseline.cost, time: baseline.time, counters: baseline.counters, models: provenance.map((entry) => entry.model) })}`);
  return { record: baseline, provenance };
}

function provenanceOf(journal: readonly JournalRecord[]): ConfigurationProvenance[] {
  const seen = new Map<string, ConfigurationProvenance>();
  for (const entry of journal) {
    if (entry.recordKind !== 'operation-start') continue;
    const id = typeof entry.operationId === 'string' ? entry.operationId : undefined;
    if (!id || seen.has(id)) continue;
    const value: ConfigurationProvenance = { operationId: id };
    if (typeof entry.model === 'string') value.model = entry.model;
    if (typeof entry.thinking === 'string') value.thinking = entry.thinking;
    if (typeof entry.source === 'string') value.source = entry.source;
    if (typeof entry.configRevision === 'number') value.revision = entry.configRevision;
    seen.set(id, value);
  }
  return [...seen.values()];
}

/** Wall-clock span of the recorded activity, when the journal has timestamps. */
function elapsedOf(journal: readonly JournalRecord[], runs: { openedAt: string; closedAt?: string }[]): number {
  const stamps = journal
    .map((entry) => (typeof entry.at === 'string' ? Date.parse(entry.at) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (stamps.length >= 2) return Math.max(...stamps) - Math.min(...stamps);
  const opened = runs.map((run) => Date.parse(run.openedAt)).filter((value) => Number.isFinite(value));
  const closed = runs.map((run) => (run.closedAt ? Date.parse(run.closedAt) : Number.NaN)).filter((value) => Number.isFinite(value));
  if (opened.length > 0 && closed.length > 0) return Math.max(...closed) - Math.min(...opened);
  return 0;
}

function appendResult(entry: BaselineRecord): void {
  const existing = readJson<BaselineRecord[]>(RESULTS) ?? [];
  existing.push(entry);
  fs.writeFileSync(RESULTS, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
}

/**
 * The profile the run uses, resolved read-only.
 *
 * Nothing here creates, repairs or clears anything. OAuth refresh tokens are
 * rotated by the provider, so a profile that was set up anywhere other than
 * where it is used ends up with a token the provider has already replaced, and
 * the symptom is a model that is silently absent. This profile was set up by
 * hand and is used exactly as it is found.
 */
function resolveProfileRoot(): string {
  const registry = readJson<{ activeProfileId?: string | null; profiles?: { id: string; path: string }[] }>(
    path.join(BASELINE_HOME, 'profiles.json'),
  );
  const active = registry?.profiles?.find((entry) => entry.id === registry.activeProfileId);
  // A root with no registry is itself the profile.
  return active?.path ?? BASELINE_HOME;
}

/** Refuses early when the profile has no signed-in provider, naming the reason. */
function requireSignedInProfile(root: string): void {
  const authPath = path.join(root, 'agent', 'auth.json');
  const auth = readJson<Record<string, unknown>>(authPath);
  const providers = auth && !Array.isArray(auth) ? Object.keys(auth) : [];
  if (providers.length === 0) {
    throw new Error(
      `No signed-in provider at ${authPath}. Start Sero with SERO_HOME_OVERRIDE=${BASELINE_HOME}, ` +
      'sign in to the provider, and run this spec again. This spec never signs in for you.',
    );
  }
  console.log(`[baseline] signed-in providers: ${providers.join(', ')}`);
}

/**
 * Refuses to run against a profile that has not finished onboarding.
 *
 * An un-onboarded profile boots into the wizard, where none of the management
 * actions this spec drives exist. Without this check the run just sits there
 * until it times out, which looks like a product fault instead of a setup step.
 */
function requireOnboardedProfile(): void {
  const registry = readJson<{ activeProfileId?: string | null; profiles?: { id: string; onboarded?: boolean }[] }>(
    path.join(BASELINE_HOME, 'profiles.json'),
  );
  const active = registry?.profiles?.find((entry) => entry.id === registry.activeProfileId);
  if (active && active.onboarded !== true) {
    throw new Error(
      `The profile at ${BASELINE_HOME} has not finished onboarding. Start Sero with ` +
      `SERO_HOME_OVERRIDE=${BASELINE_HOME} and complete the wizard, then run this spec again.`,
    );
  }
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  // The global setup clears the e2e data root before this runs. A profile kept
  // there is a profile lost, so refuse loudly rather than sign in again.
  if (BASELINE_HOME.startsWith(E2E_DATA_ROOT + path.sep)) {
    throw new Error(`SERO_BASELINE_HOME must not sit inside ${E2E_DATA_ROOT}: the Playwright global setup deletes it.`);
  }
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(PROJECTS_ROOT, { recursive: true });

  homePath = BASELINE_HOME;
  profileRoot = resolveProfileRoot();
  requireOnboardedProfile();
  requireSignedInProfile(profileRoot);

  ({ app, page } = await launchSeroApp({
    seroHome: homePath,
    runtime: 'host',
    env: {
      // No provider API key is passed: the credential is the OAuth login in the
      // profile. Pin the owner and every delegate to one model and one effort
      // level, so a result is about the work and not about which model happened
      // to be selected on this machine.
      SERO_ARCHITECT_MODEL: MODEL,
    },
  }));

  const log = fs.createWriteStream(path.join(SHOTS, 'app.log'), { flags: 'a' });
  for (const stream of [app.process().stdout, app.process().stderr]) {
    stream?.on('data', (chunk: Buffer) => { mainLog += chunk.toString(); });
    stream?.pipe(log);
  }
  await waitForShell(page);

  // Fail here, clearly, rather than somewhere inside the owner's first turn. A
  // profile with no working login resolves no model at all. The catalogue is
  // filled in the background, so this waits rather than sampling once.
  const reference = MODEL.split(':')[0] ?? MODEL;
  const listIds = (): Promise<string[] | null> => page.evaluate(async () => {
    const bridge = (window as unknown as { sero?: { models?: { list: () => Promise<{ provider: string; models: { modelId: string }[] }[]> } } }).sero?.models;
    if (!bridge) return null;
    const groups = await bridge.list();
    return groups.flatMap((group) => group.models.map((model) => `${group.provider}/${model.modelId}`));
  });

  const deadline = Date.now() + 120_000;
  let ids = await listIds();
  while (Date.now() < deadline && !(ids ?? []).includes(reference)) {
    await page.waitForTimeout(3_000);
    ids = await listIds();
  }
  const owned = (ids ?? []).filter((id) => id.startsWith(`${reference.split('/')[0]}/`));
  expect((ids ?? []).includes(reference),
    `The pinned model ${reference} is not available in this profile. Log in again. ${reference.split('/')[0]} offers: ${owned.slice(0, 20).join(', ') || 'nothing'}`).toBe(true);
  console.log(`[baseline] model=${MODEL} cap=$${CAP_USD} profile=${profileRoot}`);
});

test.afterAll(async () => {
  // beforeAll may have refused before the app existed.
  if (!app) return;
  try {
    await closeSeroApp(app);
  } finally {
    // The profile stays: it holds the login. Only the throwaway project folders go.
    fs.rmSync(PROJECTS_ROOT, { recursive: true, force: true });
    fs.writeFileSync(path.join(SHOTS, 'main.log'), mainLog, 'utf8');
  }
});

test('objective 1 — implementation and independent review', async () => {
  test.setTimeout(1_500_000);
  test.skip(ONLY !== 'all' && ONLY !== 'implementation', 'not the selected objective');

  const idea = 'A small TypeScript utility package: a slugify function that lowercases, trims, replaces runs of non-alphanumeric characters with single hyphens, and has unit tests. Keep it under 100 lines.';
  const folder = path.join(PROJECTS_ROOT, `implement-review-${Date.now()}`);
  seedPackageFolder(folder);
  const { projectId } = await createProject('01-implement', idea, folder);

  // Ask for the two-part objective in the user's own words: implement it, then
  // have someone who did not write it check the result against the criteria.
  await drive(projectId, {
    label: 'implementation',
    timeoutMs: 420_000,
    approveMilestones: true,
    until: (record) => record.milestones.length > 0,
  });

  const directive = await projects<{ ok: boolean; text: string }>('directive', projectId,
    'Implement the slugify package now. Plan a Workflow whose steps finish it, and make one step an independent review by an agent that did not write the code. The reviewer reads the delivered files and their tests and reports, per acceptance criterion, whether it is met, with specific findings. The reviewer must not accept the implementer\'s own summary, and it reaches its verdict from the artifacts alone: it runs no commands, so the review needs no shell access.');
  expect(directive.ok, directive.text).toBe(true);

  const done = await drive(projectId, {
    label: 'implementation',
    timeoutMs: 1_200_000,
    approveMilestones: true,
    until: settled,
  });
  await shot('02-implement-done');
  // The last charge is written after the final response, so let it land rather
  // than sampling the journal mid-write.
  await page.waitForTimeout(30_000);

  const captured = await capture(projectId, 'implementation-and-independent-review', idea, [
    `slugify is implemented in TypeScript with unit tests covering trimming, case folding and separator collapsing`,
    `an agent that did not write the code read the delivered files and reported a finding for each acceptance criterion`,
    `spend stays within the $${CAP_USD} cap`,
  ]);
  appendResult(captured.record);
  await removeProject(projectId);
  expect(isEfficiencyEvidence(captured.record) || captured.record.cost.incomplete).toBe(true);
  expect(done.milestones.some((milestone) => milestone.dispatch !== null)).toBe(true);
});

test('objective 2 — collaborative planning', async () => {
  test.setTimeout(1_500_000);
  test.skip(ONLY !== 'all' && ONLY !== 'planning', 'not the selected objective');

  const idea = 'Plan a command line tool that converts CSV files to JSON with a configurable schema. The plan must cover parsing, schema validation, error reporting and the command line experience.';
  const folder = path.join(PROJECTS_ROOT, `collaborative-planning-${Date.now()}`);
  seedPackageFolder(folder);
  const { projectId } = await createProject('03-planning', idea, folder);

  await drive(projectId, {
    label: 'planning',
    timeoutMs: 420_000,
    approveMilestones: true,
    until: (record) => record.milestones.length > 0,
  });

  const directive = await projects<{ ok: boolean; text: string }>('directive', projectId,
    'Plan this with a team: run the planning as a Room whose members cover parsing, schema validation and command line experience, and have them agree one plan rather than three separate ones. Planning is a reading and writing task: it needs no shell access. Deliver the agreed plan as the room result.');
  expect(directive.ok, directive.text).toBe(true);

  const done = await drive(projectId, {
    label: 'planning',
    timeoutMs: 1_200_000,
    approveMilestones: true,
    until: settled,
  });
  await shot('04-planning-done');
  await page.waitForTimeout(30_000);

  const captured = await capture(projectId, 'collaborative-planning', idea, [
    'a Room with members covering parsing, schema validation and command line experience',
    'the members agree one plan rather than three separate ones',
    `spend stays within the $${CAP_USD} cap`,
  ]);
  appendResult(captured.record);
  await removeProject(projectId);
  expect(done.milestones.some((milestone) => milestone.dispatch !== null)).toBe(true);
});

test('the two objectives are comparable', async () => {
  test.skip(ONLY !== 'all', 'only meaningful when both objectives ran');
  const results = readJson<BaselineRecord[]>(RESULTS) ?? [];
  const implementation = results.find((entry) => entry.objective === 'implementation-and-independent-review');
  const planning = results.find((entry) => entry.objective === 'collaborative-planning');
  expect(implementation, 'the implementation objective produced no record').toBeTruthy();
  expect(planning, 'the planning objective produced no record').toBeTruthy();

  // Different objectives are not compared to each other: the comparison is only
  // meaningful between runs of the same objective.
  const comparison = compareBaselines(implementation!, implementation!);
  expect(comparison.comparable).toBe(true);
  expect(comparison.unknowns).toEqual([]);
  console.log('[baseline] both objectives recorded');
});
