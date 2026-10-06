/**
 * Strategy pilot (change improve-architect-orchestrator-autonomy, tasks 1.3 and 1.4).
 *
 * Runs five scenarios (small fix, debugging, substantial feature, collaborative
 * research, interruption) through two candidates, repeated, and records what each
 * delivered and what it cost:
 *
 *   architect                the current Architect: a project, approvals a user
 *                            would give, driven until its work settles.
 *   persistent-single-agent  one ordinary chat session in a workspace on the same
 *                            seeded folder, given the same request.
 *
 * Neither is told to use a Workflow or a Room. Both get the scenario's request
 * word for word, the same starting files, the same model and effort, and the same
 * per-run budget and time bound (see architect-baseline/manifest.ts).
 *
 * The outcome of a run comes only from the scenario's independent checks, run
 * against the delivered folder after the run. A run that did not finish inside its
 * bounds is incomplete whatever its checks say. A number the harness cannot observe
 * is left out of the record and the cost stays incomplete: nothing is filled with
 * zero. The pre-paid checks that need no app run in
 * architect-baseline.contract.spec.ts.
 *
 *   env -u ELECTRON_RUN_AS_NODE SERO_E2E_ARCHITECT_BASELINE=1 SERO_BASELINE_TOTAL_CAP=20 \
 *     npx playwright test e2e/architect-baseline.agent.spec.ts --project=agent
 *
 * SERO_BASELINE_TIER (low or med, default low) picks the global tier both
 * candidates run on. SERO_BASELINE_CAP is the per-run USD cap, SERO_BASELINE_MINUTES
 * the per-run time bound, SERO_BASELINE_TOTAL_CAP the aggregate USD bound (required:
 * no new run starts once recorded spend reaches it), SERO_BASELINE_REPEATS the runs
 * per strategy and scenario (default 2). SERO_BASELINE_ONLY and
 * SERO_BASELINE_STRATEGY filter by scenario id or strategy, comma separated.
 * Results go to e2e/screenshots/architect-baseline/pilot/. The earlier baseline.json
 * and its images beside it are historical evidence and are never touched.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, createOpenAgentSession, E2E_DATA_ROOT, launchSeroApp, waitForShell } from './helpers';
import {
  compareBaselines, outcomeFromChecks,
  type BaselineComparison, type BaselineIntervention, type BaselineRecord, type BaselineRecovery, type BaselineStrategy,
} from '../../../plugins/sero-architect-plugin/runtime/baseline';
import { summarizeTiming, summarizeTrace, tokenComposition, type ConfigurationProvenance } from '../../../plugins/sero-architect-plugin/runtime/trace-summary';
import type { JournalRecord } from '../../../plugins/sero-architect-plugin/runtime/run-journal';
import { runChecks } from './architect-baseline/checks';
import { buildManifest, STRATEGIES, type RunPlan } from './architect-baseline/manifest';
import { SCENARIOS, type ScenarioDefinition } from './architect-baseline/scenarios';
import { observeSession } from './architect-baseline/session-file';
import { resolveTier, tierFromEnv, type ResolvedTier } from './architect-baseline/tier';

const ENABLED = process.env.SERO_E2E_ARCHITECT_BASELINE === '1';
const list = (value: string | undefined): string[] | null => (value && value !== 'all' ? value.split(',').map((item) => item.trim()) : null);
const ONLY = list(process.env.SERO_BASELINE_ONLY);
const ONLY_STRATEGY = list(process.env.SERO_BASELINE_STRATEGY);
const CAP_USD = Number(process.env.SERO_BASELINE_CAP ?? '2');
const MINUTES = Number(process.env.SERO_BASELINE_MINUTES ?? '20');
const TOTAL_CAP_USD = Number(process.env.SERO_BASELINE_TOTAL_CAP ?? 'NaN');
const REPEATS = Number(process.env.SERO_BASELINE_REPEATS ?? '2');
const BATCH_ID = process.env.SERO_BASELINE_BATCH ?? new Date().toISOString().replace(/[:.]/g, '-');
const SHOTS = path.resolve(__dirname, 'screenshots', 'architect-baseline');
const PILOT = path.join(SHOTS, 'pilot');
const RECORDS = path.join(PILOT, 'records.json');
const COMPARISONS = path.join(PILOT, 'comparisons.json');
const MANIFEST = path.join(PILOT, 'manifest.json');
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
test.skip(!ENABLED, 'Set SERO_E2E_ARCHITECT_BASELINE=1 to run the strategy pilot. It spends real money.');

/** The record fields this harness reads. */
interface BaselineProjectRecord {
  id: string;
  phase: string;
  folder: string;
  budget: { capUsd: number | null; spentUsd: number; incomplete?: boolean };
  decisions: { id: string; question: string; options: { id: string; label: string }[]; answer: { optionId: string } | null }[];
  milestones: { id: string; title: string; status: string; plan: string | null; dispatch: { kind: string; id: string; failure?: string } | null; pendingDispatch?: unknown }[];
  runs?: { id: string; startedAt: string; endedAt: string | null; outcome?: string }[];
  session: { turns: number; sessionPath: string | null; model?: string | null; thinking?: string | null };
}

/** What a strategy observed about its own run. Everything else is read from the delivered folder. */
interface Observed {
  finished: boolean;
  models: ConfigurationProvenance[];
  cost: BaselineRecord['cost'];
  time: BaselineRecord['time'];
  counters: BaselineRecord['counters'];
  ownerTokensPerTurn?: number[];
  interventions: BaselineIntervention[];
  recoveries: BaselineRecovery[];
}

let app: ElectronApplication;
let page: Page;
let profileRoot = '';
let tier: ResolvedTier;
let mainLog = '';
const plans = new Map<string, RunPlan>();
const planKey = (scenario: string, replicate: number): string => `${scenario}:${replicate}`;

const architectHome = (): string => path.join(profileRoot, 'apps', 'architect');
const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const readRecords = (): BaselineRecord[] => readJson<BaselineRecord[]>(RECORDS) ?? [];
const recordedSpendUsd = (): number => readRecords().reduce((total, entry) => total + entry.cost.attributableUsd, 0);

// ── App ──────────────────────────────────────────────────────────────

async function launch(): Promise<void> {
  ({ app, page } = await launchSeroApp({
    seroHome: BASELINE_HOME,
    runtime: 'host',
    env: {
      // No provider API key is passed: the credential is the OAuth login in the
      // profile. The owner is pinned to the resolved tier's model and effort, so a
      // result is about the work and not about which model happened to be selected.
      SERO_ARCHITECT_MODEL: `${tier.model}:${tier.thinking}`,
    },
  }));
  const log = fs.createWriteStream(path.join(SHOTS, 'app.log'), { flags: 'a' });
  for (const stream of [app.process().stdout, app.process().stderr]) {
    stream?.on('data', (chunk: Buffer) => { mainLog += chunk.toString(); });
    stream?.pipe(log);
  }
  await waitForShell(page);
}

/** Quits the app and starts it again on the same profile, the way a user would. */
async function restartApp(): Promise<void> {
  await closeSeroApp(app);
  await launch();
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
      await sleep(2_000);
    }
  }
  throw lastError;
}

const show = (projectId: string): Promise<BaselineProjectRecord | null> => projects<BaselineProjectRecord | null>('show', projectId);

/** The prompts that ask the user to permit work. Nothing else is clicked. */
const APPROVAL_LABELS = ['Allow', 'Approve'] as const;

/**
 * Answers every permission prompt on screen, and returns how many it answered.
 *
 * A grant is not one event: starting a project asks to run the owner session, and
 * a run can ask again later. Only the known permit labels are clicked. A decision
 * is answered through the runtime action instead, where the options are real
 * alternatives and picking the first button would be a guess.
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

/**
 * Seeds the starting files as a committed git repository, the same for both
 * strategies. Evidence and diffs need a commit to compare against, and neither
 * candidate should have to spend a turn creating one.
 */
function seedWorkspace(scenario: ScenarioDefinition, folder: string): void {
  scenario.seed(folder);
  const git = (...args: string[]): void => { execFileSync('git', ['-c', 'user.name=Baseline', '-c', 'user.email=baseline@example.invalid', ...args], { cwd: folder, stdio: 'ignore' }); };
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'Starting files');
}

// ── Architect candidate ──────────────────────────────────────────────

/**
 * True once the run reached its end. `verifying` is not the end: a milestone
 * enters it when evidence collection starts, long before the objective is
 * finished. A milestone planned but not dispatched does not hold the run open. A
 * run the Architect closed or delivered without dispatching also ends it, so a
 * run that works some other way is not waited on forever.
 */
function architectFinished(record: BaselineProjectRecord): boolean {
  const dispatched = record.milestones.filter((milestone) => milestone.dispatch !== null);
  const settled = dispatched.length > 0
    && dispatched.every((milestone) => milestone.status === 'done' || milestone.status === 'parked' || Boolean(milestone.dispatch?.failure))
    && !record.milestones.some((milestone) => milestone.pendingDispatch !== undefined);
  return settled || (record.runs ?? []).some((run) => run.outcome === 'delivered' || run.endedAt !== null);
}

/**
 * Asks the host to run the owner and answers its permission cards.
 *
 * `resume` is the action that asks, and it does not return until the card is
 * answered, so the call and the clicks overlap.
 */
async function resumeProject(label: string, projectId: string): Promise<{ ok: boolean; text: string }> {
  const state: { outcome: { ok: boolean; text: string } | null } = { outcome: null };
  void projects<{ ok: boolean; text: string }>('resume', projectId).then((value) => { state.outcome = value; }, (error: unknown) => {
    state.outcome = { ok: false, text: error instanceof Error ? error.message : String(error) };
  });
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline && !state.outcome) {
    await approvePrompts(label);
    if (state.outcome) break;
    await sleep(2_000);
  }
  return state.outcome ?? { ok: false, text: `resume() never returned. On screen: ${await screenText()}` };
}

/** What is actually on screen, so a missing card is a fact and not a guess. */
async function screenText(): Promise<string> {
  const buttons = await page.getByRole('button').allInnerTexts().catch(() => []);
  const body = await page.locator('body').innerText().catch(() => '');
  return `buttons=[${buttons.map((entry) => entry.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40).join(' | ')}] text=${body.slice(0, 600).replace(/\s+/g, ' ')}`;
}

type DriveEnd = 'finished' | 'interrupt' | 'timeout';

/**
 * Answers what the owner asks until the run ends, `interrupt` holds, or the time
 * bound passes.
 *
 * It approves what a user would approve and nothing more: a charter, a milestone
 * plan, and any decision the owner raises. It never dispatches on the owner's
 * behalf, so the work that runs is the work the owner chose. Running out of time
 * is a result, not an error, so the run is still recorded.
 */
async function drive(projectId: string, label: string, deadline: number, interrupt?: (record: BaselineProjectRecord) => boolean): Promise<DriveEnd> {
  const seen = new Set<string>();
  while (Date.now() < deadline) {
    // A run can ask for permission more than once, so every pass answers what is
    // on screen rather than assuming the grant at the start was the only one.
    await approvePrompts(label);
    const record = await show(projectId);
    if (record) {
      if (architectFinished(record)) return 'finished';
      if (interrupt?.(record)) return 'interrupt';

      for (const decision of record.decisions) {
        if (decision.answer || seen.has(decision.id)) continue;
        seen.add(decision.id);
        const choice = decision.options.find((option) => option.id === 'apply') ?? decision.options[0];
        if (!choice) continue;
        console.log(`[baseline] ${label}: answering ${decision.id} with ${choice.id} - ${decision.question}`);
        await projects<unknown>('answer', projectId, decision.id, choice.id).catch((error) => {
          console.error(`[baseline] ${label}: answer failed: ${String(error)}`);
        });
      }
      if (record.phase === 'charter') {
        await projects<unknown>('approve', projectId, 'charter').catch((error) => {
          console.error(`[baseline] ${label}: charter approval failed: ${String(error)}`);
        });
      }
      for (const milestone of record.milestones) {
        if (milestone.status !== 'planned' || !milestone.plan || seen.has(`m:${milestone.id}`)) continue;
        seen.add(`m:${milestone.id}`);
        await projects<unknown>('approve', projectId, 'milestone', milestone.id).catch((error) => {
          console.error(`[baseline] ${label}: milestone approval failed: ${String(error)}`);
        });
      }
    }
    await sleep(5_000);
  }
  console.log(`[baseline] ${label}: time bound reached. On screen: ${await screenText()}`);
  return 'timeout';
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

/**
 * Folds one Architect run into what it observed, from the stored record, the run
 * journal and the owner's session file. Coverage is reported as recorded.
 * Delegated work has no session file this harness can read, so repeated work is
 * not observed for this strategy and is left out of the record.
 */
async function observeArchitect(projectId: string, finished: boolean, elapsedMs: number, restarted: boolean, recoveries: BaselineRecovery[]): Promise<Observed> {
  const record = await show(projectId);
  if (!record) throw new Error(`project ${projectId} disappeared`);
  const runs = record.runs ?? [];
  const journal = runs.flatMap((run) => journalOf(projectId, run.id));
  const trace = summarizeTrace(journal, { projectId, runId: runs.map((run) => run.id).join(','), knownSpendUsd: record.budget.spentUsd });
  const timing = summarizeTiming(journal);
  const tokens = tokenComposition(journal);
  const provenance = provenanceOf(journal);

  // A span covers a delegated operation, which deliberately names no model: the
  // Orchestrator picked it and the Architect never saw which one ran. The owner
  // session is the one model the Architect knows exactly.
  if (record.session.model) {
    provenance.unshift({
      operationId: 'owner-session',
      model: record.session.model,
      ...(record.session.thinking ? { thinking: record.session.thinking } : {}),
      source: 'owner session',
    });
  }
  const owner = observeSession(record.session.sessionPath);
  const dispatched = record.milestones.filter((milestone) => milestone.dispatch !== null);

  return {
    finished,
    models: provenance,
    cost: {
      attributableUsd: trace.attributableUsd,
      aggregateOnlyUsd: trace.aggregateUsd,
      coverage: trace.hasAggregate ? (trace.aggregateUsd >= trace.attributableUsd ? 'aggregate' : 'partial') : 'call',
      // A request killed by the restart never reported its usage.
      incomplete: trace.incomplete || restarted || ['input', 'output'].some((key) => tokens.unavailable.includes(key)),
    },
    time: { elapsedMs, activeMs: timing.activeMs, workerMs: timing.workerMs, waitMs: timing.waitMs },
    counters: {
      agents: dispatched.length,
      turns: record.session.turns,
      requests: trace.requests,
      toolCalls: trace.toolCalls,
      retries: trace.retries,
      compactions: trace.compactions,
    },
    ...(owner && owner.tokensPerTurn.length > 0 ? { ownerTokensPerTurn: owner.tokensPerTurn } : {}),
    interventions: [],
    recoveries,
  };
}

async function runArchitect(scenario: ScenarioDefinition, folder: string, deadline: number): Promise<Observed> {
  const startedAt = Date.now();
  // The project starts on a workspace that already holds the seeded files. A new
  // folder would be refused because it exists, and an empty one gives a research
  // Room nothing to read.
  seedWorkspace(scenario, folder);
  const workspaceId = await page.evaluate(async ({ dir, name }) => (await window.sero.workspace.addFolder(dir, name)).id, { dir: folder, name: path.basename(folder) });
  const created = await projects<{ ok: boolean; text: string; projectId?: string }>('create', {
    idea: scenario.request, workspaceId, executionMode: 'workspace', capUsd: CAP_USD,
  });
  expect(created.ok, created.text).toBe(true);
  const projectId = created.projectId ?? '';
  expect(projectId, 'create returned no project id').not.toBe('');
  const started = await resumeProject(scenario.id, projectId);
  expect(started.ok, started.text).toBe(true);

  const recoveries: BaselineRecovery[] = [];
  let restarted = false;
  // Work is in flight once something is dispatched and the run has not ended.
  const midRun = (record: BaselineProjectRecord): boolean => record.milestones.some((milestone) => milestone.dispatch !== null);
  let end = await drive(projectId, scenario.id, deadline, scenario.id === 'interruption' ? midRun : undefined);
  if (end === 'interrupt') {
    restarted = true;
    await restartApp();
    // Resuming is the action the app offers after a restart, so it is what a user does.
    const resumed = await resumeProject(scenario.id, projectId);
    end = resumed.ok ? await drive(projectId, scenario.id, deadline) : 'timeout';
    recoveries.push({ cause: 'restart', result: end === 'finished' ? 'recovered' : resumed.ok ? 'held' : 'failed' });
  }
  const finished = end === 'finished';
  // The last charge is written after the final response, so let it land.
  if (finished) await sleep(30_000);
  const observed = await observeArchitect(projectId, finished, Date.now() - startedAt, restarted, recoveries);
  await projects<unknown>('delete', projectId).catch((error: unknown) => console.error(`[baseline] could not delete ${projectId}: ${String(error)}`));
  await page.evaluate((id) => window.sero.workspace.remove(id), workspaceId).catch(() => undefined);
  return observed;
}

// ── Persistent single-agent candidate ───────────────────────────────

type TurnEnd = 'settled' | 'error' | 'timeout' | 'cap' | 'interrupted';

interface TurnResult {
  end: TurnEnd;
  /** Time the agent spent inside a turn. */
  activeMs: number;
  /** How many times the agent started working in this call. */
  runs: number;
  retries: number;
  detail?: string;
}

interface TurnLimits {
  timeoutMs: number;
  capUsd: number;
  /** Stop after this many finished tool calls, to interrupt the run mid-way. */
  interruptAfterToolCalls: number | null;
}

/**
 * Sends one prompt and waits for the session to settle: its turn ended with no
 * further turn starting for a few seconds, so nothing is left pending. A turn
 * that outlives the time bound or the spend cap is aborted, and the end says why.
 * Everything is driven by the session's own events, with no polling.
 */
function chatTurn(sessionId: string, prompt: string, limits: TurnLimits): Promise<TurnResult> {
  return page.evaluate(async ({ id, text, timeoutMs, capUsd, interruptAfter }) => {
    const costBefore = (await window.sero.agent.getUsage(id))?.cost ?? 0;
    return new Promise<TurnResult>((resolve) => {
      let activeMs = 0;
      let startedAt = 0;
      let runs = 0;
      let retries = 0;
      let toolCalls = 0;
      let ending: TurnEnd | null = null;
      let settleTimer: number | undefined;
      const stop = (): void => {
        if (startedAt) activeMs += Date.now() - startedAt;
        startedAt = 0;
      };
      const done = (end: TurnEnd, detail?: string): void => {
        window.clearTimeout(timer);
        window.clearTimeout(settleTimer);
        off();
        stop();
        resolve({ end, activeMs, runs, retries, ...(detail ? { detail } : {}) });
      };
      const abort = (end: TurnEnd): void => {
        if (ending) return;
        ending = end;
        void window.sero.agent.abort(id).catch(() => undefined).then(() => window.setTimeout(() => done(end), 3_000));
      };
      const timer = window.setTimeout(() => abort('timeout'), timeoutMs);
      const off = window.sero.agent.onEvent((event) => {
        if (event.sessionId !== id) return;
        if (event.type === 'agent_start') {
          window.clearTimeout(settleTimer);
          startedAt = Date.now();
          runs += 1;
        } else if (event.type === 'agent_end') {
          stop();
          if (ending) done(ending);
          else if (event.outcome === undefined || event.outcome === 'completed') settleTimer = window.setTimeout(() => done('settled'), 5_000);
          else done('error', `the turn ended as ${event.outcome}`);
        } else if (event.type === 'retry_start') {
          retries += 1;
        } else if (event.type === 'error') {
          done('error', event.error);
        } else if (event.type === 'tool_end') {
          toolCalls += 1;
          if (interruptAfter !== null && toolCalls >= interruptAfter && !ending) done('interrupted');
        } else if (event.type === 'message_end' && !ending) {
          void window.sero.agent.getUsage(id).then((usage) => {
            if (usage && usage.cost - costBefore >= capUsd) abort('cap');
          });
        }
      });
      window.sero.agent.prompt(id, text, undefined, `baseline-${Date.now()}`).catch((error: unknown) => {
        done('error', error instanceof Error ? error.message : String(error));
      });
    });
  }, { id: sessionId, text: prompt, timeoutMs: limits.timeoutMs, capUsd: limits.capUsd, interruptAfter: limits.interruptAfterToolCalls });
}

/** Pins a session to the resolved tier and returns the model state it reports. */
async function pinSession(sessionId: string): Promise<ConfigurationProvenance> {
  const state = await page.evaluate(async ({ id, provider, modelId, thinking }) => {
    await window.sero.agent.setModel(id, provider, modelId);
    return window.sero.agent.setThinkingLevel(id, thinking);
  }, { id: sessionId, provider: tier.provider, modelId: tier.modelId, thinking: tier.thinking });
  const actual = `${state.model.provider}/${state.model.modelId}`;
  if (actual !== tier.model || state.thinkingLevel !== tier.thinking) {
    throw new Error(`The session reports ${actual} at ${state.thinkingLevel}, not the pinned ${tier.model} at ${tier.thinking}.`);
  }
  return { operationId: 'chat-session', model: actual, thinking: state.thinkingLevel, source: `${tier.tier} tier, pinned on the session` };
}

async function runSingleAgent(scenario: ScenarioDefinition, plan: RunPlan, folder: string, deadline: number): Promise<Observed> {
  const startedAt = Date.now();
  seedWorkspace(scenario, folder);
  const { workspace, session } = await createOpenAgentSession(page, folder, `baseline ${scenario.id} r${plan.replicate}`);
  const models = [await pinSession(session.id)];
  const spentUsd = (): number => observeSession(session.path)?.costUsd ?? 0;
  const limits = (interruptAfterToolCalls: number | null): TurnLimits => ({
    timeoutMs: Math.max(1_000, deadline - Date.now()), capUsd: Math.max(0.01, CAP_USD - spentUsd()), interruptAfterToolCalls,
  });

  const interventions: BaselineIntervention[] = [];
  const recoveries: BaselineRecovery[] = [];
  const turns: TurnResult[] = [await chatTurn(session.id, scenario.request, limits(scenario.id === 'interruption' ? 2 : null))];
  let restarted = false;

  if (turns[0]?.end === 'interrupted') {
    restarted = true;
    await restartApp();
    await page.evaluate(({ id, file, ws }) => window.sero.agent.open(id, file, ws), { id: session.id, file: session.path, ws: workspace.id });
    await pinSession(session.id);
    // A chat session has no resume action, so a user would type a nudge. That
    // is coaching the Architect's project does not need, and it is recorded.
    interventions.push({ kind: 'coaching', note: 'sent "Continue." after the restart because a chat session has no resume action', at: new Date().toISOString() });
    turns.push(await chatTurn(session.id, 'Continue.', limits(null)));
  }
  if (!restarted && scenario.id === 'interruption') console.log('[baseline] the run settled before the restart point, so nothing was interrupted');

  const last = turns.at(-1);
  const finished = last?.end === 'settled';
  if (restarted) recoveries.push({ cause: 'restart', result: finished ? 'recovered' : last?.end === 'timeout' ? 'held' : 'failed' });

  const elapsedMs = Date.now() - startedAt;
  const activeMs = turns.reduce((total, turn) => total + turn.activeMs, 0);
  const seen = observeSession(session.path);
  await page.evaluate((id) => window.sero.agent.close(id), session.id).catch(() => undefined);
  await page.evaluate((id) => window.sero.workspace.remove(id), workspace.id).catch(() => undefined);

  return {
    finished,
    models,
    cost: {
      attributableUsd: seen?.costUsd ?? 0,
      aggregateOnlyUsd: 0,
      coverage: seen ? 'call' : 'partial',
      // The request a restart killed never wrote its usage, and no file means no measurement.
      incomplete: !seen || seen.incomplete || seen.requests === 0 || restarted,
    },
    // One agent works alone, so its worker time is its active time. Time outside
    // its turns is the harness waiting, including the restart.
    time: { elapsedMs, activeMs, workerMs: activeMs, waitMs: Math.max(0, elapsedMs - activeMs) },
    counters: {
      agents: 1,
      turns: turns.reduce((total, turn) => total + turn.runs, 0),
      requests: seen?.requests ?? 0,
      toolCalls: seen?.toolCalls ?? 0,
      retries: turns.reduce((total, turn) => total + turn.retries, 0),
      compactions: seen?.compactions ?? 0,
    },
    ...(seen && seen.tokensPerTurn.length > 0 ? { ownerTokensPerTurn: seen.tokensPerTurn } : {}),
    interventions,
    recoveries,
  };
}

// ── Records and comparisons ─────────────────────────────────────────

function toRecord(scenario: ScenarioDefinition, plan: RunPlan, strategy: BaselineStrategy, folder: string, observed: Observed): BaselineRecord {
  const checks = runChecks(folder, scenario.checks);
  return {
    candidate: strategy,
    objective: scenario.id,
    models: observed.models,
    acceptanceCriteria: scenario.checks.map((check) => `${check.id}: ${check.summary}`),
    cost: observed.cost,
    time: observed.time,
    counters: observed.counters,
    outcome: outcomeFromChecks(checks, observed.finished),
    budgetUsd: CAP_USD,
    evidence: 'live',
    recordedAt: new Date().toISOString(),
    run: plan.runs[strategy],
    inputs: plan.inputs,
    checks,
    interventions: observed.interventions,
    recoveries: observed.recoveries,
    ...(observed.ownerTokensPerTurn ? { ownerTokensPerTurn: observed.ownerTokensPerTurn } : {}),
  };
}

/** What a record leaves out because the harness could not observe it for that strategy. */
function unobserved(record: BaselineRecord): string[] {
  const gaps = ['protocolFailures'];
  if (record.candidate === 'architect') gaps.push('repeatedWork (delegated sessions are not readable)');
  else gaps.push('repeatedWork (no signal for a repeated investigation)');
  if (!record.ownerTokensPerTurn) gaps.push('ownerTokensPerTurn');
  if (record.objective === 'interruption' && (record.recoveries?.length ?? 0) === 0) gaps.push('recoveries (the run finished before the restart point)');
  return gaps;
}

interface PairComparison {
  scenario: string;
  replicate: number;
  architectRunId: string;
  singleAgentRunId: string;
  comparison: BaselineComparison;
  /** What neither record could observe, so a delta is not read as a measured zero. */
  unobserved: Record<string, string[]>;
}

for (const scenario of SCENARIOS) {
  if (ONLY && !ONLY.includes(scenario.id)) continue;
  for (let replicate = 1; replicate <= REPEATS; replicate += 1) {
    // Alternate which strategy goes first, so a slow hour does not always land on one of them.
    const order = replicate % 2 === 1 ? STRATEGIES : [...STRATEGIES].reverse();
    for (const strategy of order) {
      if (ONLY_STRATEGY && !ONLY_STRATEGY.includes(strategy)) continue;
      test(`${scenario.id} r${replicate} ${strategy}`, async () => {
        test.setTimeout((MINUTES + 15) * 60_000);
        test.skip(recordedSpendUsd() >= TOTAL_CAP_USD, `recorded spend has reached the $${TOTAL_CAP_USD} total cap`);
        const plan = plans.get(planKey(scenario.id, replicate));
        if (!plan) throw new Error(`no manifest for ${scenario.id} r${replicate}`);
        const folder = path.join(PROJECTS_ROOT, `${scenario.id}-r${replicate}-${strategy}-${Date.now()}`);
        const deadline = Date.now() + MINUTES * 60_000;

        const observed = strategy === 'architect'
          ? await runArchitect(scenario, folder, deadline)
          : await runSingleAgent(scenario, plan, folder, deadline);
        const record = toRecord(scenario, plan, strategy, folder, observed);
        fs.mkdirSync(PILOT, { recursive: true });
        writeJson(RECORDS, [...readRecords(), record]);
        console.log(`[baseline] ${record.run?.runId}: ${record.outcome} ${JSON.stringify({ checks: record.checks, cost: record.cost, time: record.time })}`);
        expect(record.checks).toHaveLength(scenario.checks.length);
      });
    }
  }
}

test('each strategy pair is two distinct runs, compared without claiming an improvement', async () => {
  const mine = readRecords().filter((entry) => entry.run?.runId.startsWith(`${BATCH_ID}:`));
  const pairs: PairComparison[] = [];
  for (const architect of mine.filter((entry) => entry.run?.strategy === 'architect')) {
    const single = mine.find((entry) => entry.run?.strategy === 'persistent-single-agent'
      && entry.objective === architect.objective && entry.run.replicate === architect.run?.replicate);
    if (!single || !architect.run || !single.run) continue;
    // The strategies' records for one scenario and replicate, never a record with itself.
    const comparison = compareBaselines(architect, single);
    expect(single.run.runId, 'a pair must be two distinct runs').not.toBe(architect.run.runId);
    pairs.push({
      scenario: String(architect.objective),
      replicate: architect.run.replicate,
      architectRunId: architect.run.runId,
      singleAgentRunId: single.run.runId,
      comparison,
      unobserved: { architect: unobserved(architect), 'persistent-single-agent': unobserved(single) },
    });
    console.log(`[baseline] ${architect.objective} r${architect.run.replicate}: comparable=${comparison.comparable} mismatches=[${comparison.mismatches.join(', ')}] unknowns=${comparison.unknowns.length}`);
  }
  test.skip(pairs.length === 0, 'no scenario has both strategies recorded in this batch');
  const kept = (readJson<PairComparison[]>(COMPARISONS) ?? []).filter((old) => !pairs.some((pair) => pair.architectRunId === old.architectRunId));
  writeJson(COMPARISONS, [...kept, ...pairs]);
});

// ── Setup ────────────────────────────────────────────────────────────

/**
 * The profile the run uses, resolved read-only.
 *
 * OAuth refresh tokens are rotated by the provider, so a profile that was set up
 * anywhere other than where it is used ends up with a token the provider has
 * already replaced, and the symptom is a model that is silently absent.
 */
function resolveProfileRoot(): string {
  const registry = readJson<{ activeProfileId?: string | null; profiles?: { id: string; path: string }[] }>(path.join(BASELINE_HOME, 'profiles.json'));
  const active = registry?.profiles?.find((entry) => entry.id === registry.activeProfileId);
  // A root with no registry is itself the profile.
  return active?.path ?? BASELINE_HOME;
}

/** Refuses early when the profile is not onboarded or has no signed-in provider. */
function requireUsableProfile(root: string): void {
  const registry = readJson<{ activeProfileId?: string | null; profiles?: { id: string; onboarded?: boolean }[] }>(path.join(BASELINE_HOME, 'profiles.json'));
  const active = registry?.profiles?.find((entry) => entry.id === registry.activeProfileId);
  if (active && active.onboarded !== true) {
    throw new Error(`The profile at ${BASELINE_HOME} has not finished onboarding. Start Sero with SERO_HOME_OVERRIDE=${BASELINE_HOME} and complete the wizard, then run this spec again.`);
  }
  const authPath = path.join(root, 'agent', 'auth.json');
  const auth = readJson<Record<string, unknown>>(authPath);
  if (!auth || Array.isArray(auth) || Object.keys(auth).length === 0) {
    throw new Error(`No signed-in provider at ${authPath}. Start Sero with SERO_HOME_OVERRIDE=${BASELINE_HOME}, sign in to the provider, and run this spec again. This spec never signs in for you.`);
  }
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  if (BASELINE_HOME.startsWith(E2E_DATA_ROOT + path.sep)) {
    throw new Error(`SERO_BASELINE_HOME must not sit inside ${E2E_DATA_ROOT}: the Playwright global setup deletes it.`);
  }
  for (const [name, value] of [['SERO_BASELINE_CAP', CAP_USD], ['SERO_BASELINE_MINUTES', MINUTES], ['SERO_BASELINE_REPEATS', REPEATS]] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`);
  }
  if (!Number.isFinite(TOTAL_CAP_USD) || TOTAL_CAP_USD <= 0) {
    throw new Error('SERO_BASELINE_TOTAL_CAP (USD) is required: the pilot refuses to start without an aggregate spend bound.');
  }
  fs.mkdirSync(PILOT, { recursive: true });
  fs.mkdirSync(PROJECTS_ROOT, { recursive: true });

  profileRoot = resolveProfileRoot();
  requireUsableProfile(profileRoot);
  tier = resolveTier(readJson<unknown>(path.join(profileRoot, 'agent', 'settings.json')), tierFromEnv(process.env.SERO_BASELINE_TIER));
  await launch();

  // Fail here, clearly, rather than inside the owner's first turn. The catalogue is
  // filled in the background, so this waits rather than sampling once.
  const listIds = (): Promise<string[] | null> => page.evaluate(async () => {
    const groups = await window.sero.models.list();
    return groups.flatMap((group) => group.models.map((model) => `${group.provider}/${model.modelId}`));
  }).catch(() => null);
  const deadline = Date.now() + 120_000;
  let ids = await listIds();
  while (Date.now() < deadline && !(ids ?? []).includes(tier.model)) {
    await sleep(3_000);
    ids = await listIds();
  }
  expect(ids ?? [], `The ${tier.tier} tier model ${tier.model} is not available in this profile. Log in again.`).toContain(tier.model);

  // The pin was read from disk before launch. The running app must agree, or the
  // owner would run on one model and the single agent on another.
  const live = await page.evaluate(async (name) => (await window.sero.modelConfig.get()).tiers[name] ?? null, tier.tier);
  expect(live && `${live.provider}/${live.modelId}`, `The running app resolves the ${tier.tier} tier differently from settings.json.`).toBe(tier.model);

  const settings = { model: tier.model, thinking: tier.thinking, budgetUsd: CAP_USD, budgetMinutes: MINUTES, batchId: BATCH_ID };
  for (const scenario of SCENARIOS) {
    for (let replicate = 1; replicate <= REPEATS; replicate += 1) plans.set(planKey(scenario.id, replicate), buildManifest(scenario, replicate, settings));
  }
  writeJson(MANIFEST, { batchId: BATCH_ID, tier: tier.tier, settings, plans: [...plans.values()] });
  console.log(`[baseline] tier=${tier.tier} model=${tier.model}:${tier.thinking} cap=$${CAP_USD}/run, ${MINUTES} min/run, $${TOTAL_CAP_USD} total, profile=${profileRoot}`);
});

test.afterAll(async () => {
  // beforeAll may have refused before the app existed.
  if (!app) return;
  try {
    await closeSeroApp(app);
  } finally {
    // The profile stays: it holds the login. Only the throwaway folders go.
    fs.rmSync(PROJECTS_ROOT, { recursive: true, force: true });
    fs.writeFileSync(path.join(SHOTS, 'main.log'), mainLog, 'utf8');
  }
});
