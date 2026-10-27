/**
 * Helpers the cron, memory, usage, output-optimizer and search probes share:
 * the profile folder (the app's SERO_HOME), JSON state reads, a bounded wait
 * for an effect that lands after the call returns, and small assertions.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { expectText } from '../expect';
import { pageOf, waitUntil } from '../files';
import type { StepContext, ToolCallResult } from '../types';

/** The active profile's folder, which is the SERO_HOME the plugins' extensions read. */
export async function profileDir(ctx: StepContext): Promise<string> {
  const known = ctx.state.profileDir;
  if (typeof known === 'string') return known;
  const profile = await pageOf(ctx).evaluate(() => window.sero.profiles.getActive());
  if (!profile) throw new Error('the app has no active profile');
  ctx.state.profileDir = profile.path;
  return profile.path;
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function fileExists(file: string): Promise<boolean> {
  return fs.access(file).then(() => true, () => false);
}

/** Throws unless `condition` holds. */
export function must(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Waits for an effect that is written after the tool call returned, rechecking when a file under `dir` changes. */
export function waitFor<T>(dir: string, what: string, read: () => Promise<T | undefined | null | false>, timeoutMs = 60_000): Promise<T> {
  return waitUntil(dir, what, read, timeoutMs);
}

/** Fails unless the call succeeded and its text contains every fragment. */
export function expectContains(result: ToolCallResult, ...fragments: string[]): void {
  for (const fragment of fragments) expectText(result, fragment);
}

/** Fails unless the text lacks the fragment. */
export function expectLacks(result: ToolCallResult, fragment: string): void {
  must(!result.text.includes(fragment), `result still mentions ${JSON.stringify(fragment)}: ${result.text}`);
}

// ── Cron plugin state: jobs, reminders and run history share one file ─────────

export interface CronJobRecord {
  name: string;
  schedule: string;
  prompt: string;
  channel: string;
  model?: string;
  disabled?: boolean;
  runIfMissed?: boolean;
}

export interface ReminderRecord {
  id: string;
  title: string;
  notes?: string;
  channel: string;
  type: string;
  status: string;
  fireAt?: string;
  snoozedUntil?: string;
  completedAt?: string;
}

export interface CronRunRecord {
  jobName: string;
  startedAt: string;
  ok: boolean;
  output?: string;
  error?: string;
}

export interface CronStateFile {
  jobs: CronJobRecord[];
  reminders: ReminderRecord[];
  lastRunResults: CronRunRecord[];
}

/** `<profile>/apps/cron/state.json`, from plugins/sero-cron-plugin/extension/state-io.ts. */
export async function cronState(ctx: StepContext): Promise<CronStateFile> {
  const state = await readJson<Partial<CronStateFile>>(path.join(await profileDir(ctx), 'apps', 'cron', 'state.json'));
  return { jobs: state?.jobs ?? [], reminders: state?.reminders ?? [], lastRunResults: state?.lastRunResults ?? [] };
}
