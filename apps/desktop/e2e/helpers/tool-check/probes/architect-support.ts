/**
 * What the Architect probes read and do outside the tools: the project record
 * on disk, a bounded wait for an effect that lands after a call returns, and
 * the standing answer to the host's Allow cards.
 *
 * The record is `<profile>/apps/architect/projects/<id>.json`
 * (plugins/sero-architect-plugin/shared/paths.ts).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { pageOf, waitUntil } from '../files';
import type { StepContext, ToolCallResult } from '../types';
import { ALLOW } from './rooms-support';

export interface CriterionFile { id: string; text: string; userStated: boolean }

export interface MilestoneFile {
  id: string;
  title: string;
  status: string;
  plan: string | null;
  verification: string | null;
  receipt: string | null;
  openSpecChange?: string;
  dispatch: { kind: string; id: string; heldBy?: string } | null;
  direct?: { id: string; state: string };
  evidence: { passed: boolean; stale?: boolean; binding?: { criteria: Array<{ id: string }> } } | null;
}

export interface ProjectFile {
  id: string;
  name: string;
  phase: string;
  folder: string;
  paused: boolean;
  preparingMaintenance?: boolean;
  blockedReason: string | null;
  autonomy: string;
  executionMode?: string;
  stateLine: string;
  brief: string | null;
  openSpecEnabled?: boolean;
  budget: { capUsd: number | null };
  agreement?: { approvedAt: string | null };
  charter: { approvedAt: string | null; autonomy: string } | null;
  working?: { revision: number; objective: string; criteria: CriterionFile[] };
  overview?: Record<string, { text: string }>;
  modelOverrides?: Record<string, { modelId: string }>;
  modelTiers?: Record<string, { modelId: string }>;
  milestones: MilestoneFile[];
  decisions: Array<{ id: string; answer: { optionId: string } | null }>;
  directives: Array<{ id: string; reply: { text: string } | null }>;
  research: Array<{ id: string; result: string }>;
  waits?: Array<{ outcome: unknown }>;
  session: { sessionPath?: string };
}

export function must(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** The active profile's folder, which holds the Architect's records. */
export async function profileDir(ctx: StepContext): Promise<string> {
  const known = ctx.state.profileDir;
  if (typeof known === 'string') return known;
  const profile = await pageOf(ctx).evaluate(() => window.sero.profiles.getActive());
  must(profile, 'the app has no active profile');
  ctx.state.profileDir = profile.path;
  return profile.path;
}

export async function projectsDir(ctx: StepContext): Promise<string> {
  return path.join(await profileDir(ctx), 'apps', 'architect', 'projects');
}

/** The project the story is on now. A failed step leaves it blank, and the action then fails by name. */
export function projectIdOf(ctx: StepContext): string {
  const id = ctx.state.projectId;
  return typeof id === 'string' ? id : 'no-project-created-yet';
}

/** A value an earlier step saved, or a placeholder the tool refuses by name, so a params function never throws. */
export function saved(ctx: StepContext, key: string): string {
  const value = ctx.state[key];
  return typeof value === 'string' ? value : `no-${key}-saved-yet`;
}

export async function readProject(ctx: StepContext, id = projectIdOf(ctx)): Promise<ProjectFile | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(await projectsDir(ctx), `${id}.json`), 'utf8')) as ProjectFile;
  } catch {
    return null;
  }
}

/** Waits for an effect that is written after the tool call returned, rechecking when a record changes. */
export async function waitForProject<T>(
  ctx: StepContext,
  what: string,
  read: (project: ProjectFile) => T | undefined | null | false,
  timeoutMs = 240_000,
): Promise<T> {
  return waitUntil(await projectsDir(ctx), what, async () => {
    const project = await readProject(ctx);
    return project ? read(project) : null;
  }, timeoutMs);
}

export async function requireProject(ctx: StepContext): Promise<ProjectFile> {
  const project = await readProject(ctx);
  must(project, `project ${projectIdOf(ctx)} is not on disk`);
  return project;
}

export function milestoneOf(project: ProjectFile, id: string): MilestoneFile {
  const found = project.milestones.find((milestone) => milestone.id === id);
  must(found, `milestone ${id} is not on the project (it has ${project.milestones.map((milestone) => milestone.id).join(', ') || 'none'})`);
  return found;
}

/** The first match of a pattern in a result, or a failure that shows the text. */
export function captured(text: string, pattern: RegExp, what: string): string {
  const value = pattern.exec(text)?.[1];
  must(value, `no ${what} in: ${text}`);
  return value;
}

// -- The host's Allow cards ----------------------------------------------------

/**
 * Presses every Allow card the host shows while the story runs: the start
 * approval, and any grant a dispatched Workflow or Room asks for. It waits on
 * the page and never polls, and it counts the cards it answered so a step can
 * prove its card showed.
 */
export class AllowCards {
  private stopped = true;
  private stopSignal: Promise<void> = Promise.resolve();
  private stop: () => void = () => undefined;
  count = 0;

  start(page: Page): void {
    this.stopped = false;
    this.count = 0;
    this.stopSignal = new Promise((resolve) => { this.stop = resolve; });
    void this.run(page);
  }

  end(): void {
    this.stopped = true;
    this.stop();
  }

  private async run(page: Page): Promise<void> {
    const button = page.getByRole('button', { name: ALLOW }).first();
    while (!this.stopped) {
      const shown = await Promise.race([
        button.waitFor({ state: 'visible', timeout: 0 }).then(() => true, () => false),
        this.stopSignal.then(() => false),
      ]);
      if (!shown || this.stopped) return;
      const pressed = await button.click({ timeout: 10_000 }).then(() => true, () => false);
      if (pressed) this.count += 1;
      // The card goes away once answered. Waiting for that keeps one card from counting twice.
      await Promise.race([
        button.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => undefined),
        this.stopSignal,
      ]);
    }
  }
}

export const allowCards = new AllowCards();

// -- Calls and results ---------------------------------------------------------

/** The parameters of an `architect` call, which always carries the project. */
export function ownerParams(ctx: StepContext, action: string, rest: Record<string, unknown> = {}): Record<string, unknown> {
  return { action, projectId: projectIdOf(ctx), ...rest };
}

/** The parameters of an `architect_projects` call on the story's project. */
export function userParams(ctx: StepContext, action: string, rest: Record<string, unknown> = {}): Record<string, unknown> {
  return { action, projectId: projectIdOf(ctx), ...rest };
}

/** The Architect tools answer a refusal with text that starts `Error: `. */
export function refusal(result: ToolCallResult): boolean {
  return result.isError === true || /(^|\n)\s*(ERROR|Error): /.test(result.text);
}

/** Fails unless the call was not refused and its text holds every fragment. */
export function succeeded(result: ToolCallResult, ...fragments: string[]): void {
  must(!refusal(result), `the call was refused: ${result.text}`);
  for (const fragment of fragments) must(result.text.includes(fragment), `the result does not mention ${JSON.stringify(fragment)}: ${result.text}`);
}

/** Fails unless the call was refused and its text holds the fragment. */
export function refused(result: ToolCallResult, fragment: string): void {
  must(refusal(result), `the call should have been refused, but returned: ${result.text}`);
  must(result.text.includes(fragment), `the refusal does not mention ${JSON.stringify(fragment)}: ${result.text}`);
}

// -- Files ---------------------------------------------------------------------

export async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(() => true, () => false);
}

/** Waits for a file under a folder to exist. */
export function waitForFile(dir: string, file: string, what: string, timeoutMs = 120_000): Promise<true> {
  return waitUntil(dir, what, async () => (await exists(file)) ? true as const : null, timeoutMs);
}

/** A Room the project started keeps its files in the project's own folder. */
export async function roomStatus(project: ProjectFile, roomId: string): Promise<string | null> {
  try {
    const file = path.join(project.folder, '.sero', 'apps', 'orchestrator', 'rooms', roomId, 'room.json');
    return (JSON.parse(await fs.readFile(file, 'utf8')) as { runtime: { status: string } }).runtime.status;
  } catch {
    return null;
  }
}

/** Waits for the project's Room to reach a status. */
export function waitForRoomStatus(ctx: StepContext, project: ProjectFile, roomId: string, status: string): Promise<true> {
  return waitUntil(path.join(project.folder, '.sero', 'apps', 'orchestrator'), `Room ${roomId} to be ${status}`,
    async () => (await roomStatus(project, roomId)) === status ? true as const : null, 120_000);
}
