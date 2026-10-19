/**
 * Shared pieces of the `orchestrator` and `goal` probes: the prompts that tell
 * the stub model's answers apart, where the plugin keeps its files, and small
 * readers for them. The plugin's own types are not imported (a relative import
 * of plugin source breaks the desktop typecheck), so each file shape below
 * lists only the fields a step checks.
 */
import path from 'node:path';
import { waitUntil } from '../files';
import type { StepContext, StepParams, ToolCallResult } from '../types';
import { fileExists, must, profileDir, readJson } from './cron-memory-support';

// ── The loops the probe builds. Each prompt starts with its token. ───────────

export const MANUAL = 'tc-orch-manual';
export const RECURRING = 'tc-orch-recurring';
export const RECOVERY = 'tc-orch-recovery';
export const ASK = 'tc-orch-ask';
export const CATALOG = 'tc-orch-catalog';
export const TOKENS = [MANUAL, RECURRING, RECOVERY, ASK, CATALOG] as const;
export type LoopToken = (typeof TOKENS)[number];

export const MANUAL_PROMPT = `${MANUAL}: write a short note and report it.`;
export const RECURRING_PROMPT = `${RECURRING}: write a short note and report it, once a year.`;
export const RECOVERY_PROMPT = `${RECOVERY}: write two short notes, one after the other.`;
export const ASK_PROMPT = `${ASK}: write a short note into a folder.`;
/** The text of the user's answer; the planner's second request carries it. */
export const ASK_ANSWER = 'tc-orch-answered';

/** A loop id one step saved for a later one. */
export type LoopKey = 'manual' | 'recurring' | 'recovery' | 'ask' | 'library' | 'catalog';

// ── Plugin files ─────────────────────────────────────────────────────────────

export interface StepFile {
  id: string;
  title: string;
  instructions: string;
  dependsOn?: string[];
  execution: { type: string; model?: string; thinking?: string; agent?: string; tools?: string[] };
}

export interface TriggerFile {
  id: string;
  type: string;
  schedule?: string;
  scheduleDisabled?: boolean;
  nextFireAt?: string;
  disabled?: boolean;
}

export interface StepStateFile {
  status: string;
  attempts: number;
  lastAttemptId?: string;
  outcome?: { status: string; summary: string };
}

export interface QuestionFile {
  id: string;
  prompt: string;
  choices?: Array<{ id: string; label: string }>;
}

export interface SuggestionFile {
  id: string;
  status: string;
  rationale: string;
  rejectionReason?: string;
}

export interface SkillDraftFile {
  id: string;
  name: string;
  status: string;
  bodyRef: string;
}

/** `loops/<id>/loop.json`: the loop without its run and revision history. */
export interface LoopFile {
  id: string;
  title: string;
  prompt: string;
  status: string;
  plan: { revision: number; steps: StepFile[] };
  triggers: TriggerFile[];
  limits: { maxCostUsd?: number; maxTotalTokens?: number };
  delivery?: { destination: string; params?: Record<string, string | number | boolean> };
  contextOverrides?: { systemPrompt?: string; disabledTools?: string[] };
  runtime: {
    stepStates: Record<string, StepStateFile>;
    block?: { kind: string; reason: string };
    completion?: { status: string };
    pendingInput?: { id: string; source: string; questions: QuestionFile[] };
    activeRunId?: string;
  };
  warnings: Array<{ code: string; stepId?: string }>;
  insights?: Array<{ summary: string }>;
  suggestions?: SuggestionFile[];
  answeredInputs?: Array<{ source: string; answers: Array<{ questionId: string; choiceId?: string; text?: string }> }>;
  libraryLink?: { entryId: string; version: number };
  skillDraft?: SkillDraftFile;
  skillLink?: { name: string; filePath: string };
}

export interface RunSummaryFile {
  id: string;
  runNumber: number;
  status: string;
  completionStatus?: string;
}

export interface RevisionFile {
  revision: number;
  reason: string;
  status: string;
}

export function orchestratorDir(ctx: StepContext): string {
  return path.join(ctx.workspacePath, '.sero', 'apps', 'orchestrator');
}

export function loopDir(ctx: StepContext, id: string): string {
  return path.join(orchestratorDir(ctx), 'loops', id);
}

export async function readLoop(ctx: StepContext, id: string): Promise<LoopFile> {
  const loop = await readJson<LoopFile>(path.join(loopDir(ctx, id), 'loop.json'));
  must(loop, `loops/${id}/loop.json is not in the workspace's orchestrator folder`);
  return loop;
}

/** The loops the plugin lists in its index, by id. */
export async function indexedLoopIds(ctx: StepContext): Promise<string[]> {
  const index = await readJson<{ loops: Array<{ id: string }> }>(path.join(orchestratorDir(ctx), 'index.json'));
  return (index?.loops ?? []).map((loop) => loop.id);
}

/** The run summaries a loop has recorded, oldest first. */
export async function readRuns(ctx: StepContext, id: string): Promise<RunSummaryFile[]> {
  const index = await readJson<{ runs: RunSummaryFile[] }>(path.join(loopDir(ctx, id), 'runs', 'index.json'));
  return index?.runs ?? [];
}

export async function readRevisions(ctx: StepContext, id: string): Promise<RevisionFile[]> {
  return (await readJson<RevisionFile[]>(path.join(loopDir(ctx, id), 'revisions.json'))) ?? [];
}

/** The profile-wide stores the library and the catalog keep under `<profile>/apps/`. */
export async function libraryDir(ctx: StepContext): Promise<string> {
  return path.join(await profileDir(ctx), 'apps', 'orchestrator-library');
}

export async function catalogDir(ctx: StepContext): Promise<string> {
  return path.join(await profileDir(ctx), 'apps', 'orchestrator-catalog');
}

/**
 * Resolves with the loop once `ready` accepts it. A pass that is still
 * finishing when the call returns is waited for by watching the folder.
 */
export function loopWhen(
  ctx: StepContext,
  id: string,
  what: string,
  ready: (loop: LoopFile) => boolean,
  timeoutMs = 60_000,
): Promise<LoopFile> {
  return waitUntil(orchestratorDir(ctx), what, async () => {
    const loop = await readJson<LoopFile>(path.join(loopDir(ctx, id), 'loop.json'));
    return loop && ready(loop) ? loop : null;
  }, timeoutMs);
}

// ── Ids handed from one step to the next ────────────────────────────────────

export function saveLoopId(ctx: StepContext, key: LoopKey, id: string): void {
  ctx.state[`orchestrator:${key}`] = id;
}

export function loopIdOf(ctx: StepContext, key: LoopKey): string {
  const id = ctx.state[`orchestrator:${key}`];
  must(typeof id === 'string', `no ${key} loop id was saved by an earlier step`);
  return id;
}

/** The id from `Created loop <id> — ...`, which `create` and `catalog_install` report. */
export function idFromText(result: ToolCallResult, pattern: RegExp): string {
  const id = pattern.exec(result.text)?.[1];
  must(id, `no id in: ${result.text}`);
  return id;
}

/** `create` parameters for a loop that runs in the shared, dirty workspace. */
export function createParams(prompt: string, extra: StepParams = {}): StepParams {
  return { action: 'create', prompt, useManagedWorktree: false, allowDirtyWorkspaceRoot: true, ...extra };
}

export async function expectLoopGone(ctx: StepContext, id: string): Promise<void> {
  must(!(await fileExists(path.join(loopDir(ctx, id), 'loop.json'))), `loops/${id}/loop.json is still on disk`);
  must(!(await indexedLoopIds(ctx)).includes(id), `${id} is still in the orchestrator index`);
}
