import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { readJsonStateSync, writeJsonStateSync } from './json-state';
import { resolveMemoryStatePath, resolveSeroHome } from './state-paths';
import type { CronJob, CronState } from './cron-types';
import { DEFAULT_CRON_STATE } from './cron-types';

export type AutoConsolidationCadence = 'daily' | 'weekly' | 'off';

interface MemoryAutomationState {
  autoConsolidationCadence?: AutoConsolidationCadence;
  autoConsolidationIntroShownAt?: string;
}

const DEFAULT_AUTOMATION_STATE: MemoryAutomationState = {};
const DEFAULT_CADENCE: AutoConsolidationCadence = 'weekly';
const AUTO_CONSOLIDATION_JOB_NAME = 'memory-consolidation';
const DAILY_SCHEDULE = '0 3 * * *';
const WEEKLY_SCHEDULE = '0 3 * * 0';

export interface AutoConsolidationSyncResult {
  cadence: AutoConsolidationCadence;
  changed: boolean;
  cronChanged: boolean;
  schedule: string | null;
  autostart: boolean;
  cronStatePath: string;
}

function resolveAutomationStatePath(): string {
  return resolveMemoryStatePath('automation.json');
}

function resolveCronStatePath(): string {
  return path.join(resolveSeroHome(), 'apps', 'cron', 'state.json');
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function readRequiredJsonFileSync<T>(filePath: string): T | null {
  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cron state file at ${filePath} is unreadable. Memory auto-consolidation will not rewrite it until the file is repaired. Original error: ${detail}`,
    );
  }
}

function normalizeCadence(value: unknown): AutoConsolidationCadence {
  return value === 'daily' || value === 'weekly' || value === 'off'
    ? value
    : DEFAULT_CADENCE;
}

function readAutomationStateSync(): MemoryAutomationState {
  return readJsonStateSync(resolveAutomationStatePath(), { ...DEFAULT_AUTOMATION_STATE });
}

function writeAutomationStateSync(state: MemoryAutomationState): void {
  writeJsonStateSync(resolveAutomationStatePath(), state);
}

function readCronStateSync(): CronState {
  const state = readRequiredJsonFileSync<Partial<CronState>>(resolveCronStatePath());
  if (!state) {
    return {
      ...DEFAULT_CRON_STATE,
      jobs: [],
      reminders: [],
      lastRunResults: [],
    };
  }
  return {
    ...DEFAULT_CRON_STATE,
    ...state,
    jobs: Array.isArray(state.jobs) ? state.jobs : [],
    reminders: Array.isArray(state.reminders) ? state.reminders : [],
    lastRunResults: Array.isArray(state.lastRunResults) ? state.lastRunResults : [],
  };
}

function writeCronStateSync(state: CronState): void {
  writeJsonStateSync(resolveCronStatePath(), state);
}

function buildAutoConsolidationJob(cadence: Exclude<AutoConsolidationCadence, 'off'>): CronJob {
  return {
    name: AUTO_CONSOLIDATION_JOB_NAME,
    schedule: cadence === 'daily' ? DAILY_SCHEDULE : WEEKLY_SCHEDULE,
    prompt: [
      'You are executing scheduled memory maintenance.',
      'Use the `sero-cli` tool immediately with this exact command:',
      'sero memory consolidate --trigger cron',
      'Do not ask questions.',
      'Return only the tool result.',
    ].join('\n'),
    channel: 'memory',
    disabled: false,
    runIfMissed: true,
  };
}

export function getAutoConsolidationCadenceSync(): AutoConsolidationCadence {
  return normalizeCadence(readAutomationStateSync().autoConsolidationCadence);
}

export function setAutoConsolidationCadenceSync(
  cadence: AutoConsolidationCadence,
): AutoConsolidationCadence {
  const nextCadence = normalizeCadence(cadence);
  const state = readAutomationStateSync();
  if (state.autoConsolidationCadence === nextCadence) return nextCadence;
  writeAutomationStateSync({ ...state, autoConsolidationCadence: nextCadence });
  return nextCadence;
}

export function shouldShowAutoConsolidationIntroSync(): boolean {
  return !readAutomationStateSync().autoConsolidationIntroShownAt;
}

export function markAutoConsolidationIntroShownSync(): void {
  const state = readAutomationStateSync();
  writeAutomationStateSync({
    ...state,
    autoConsolidationIntroShownAt: new Date().toISOString(),
  });
}

export async function getAutoConsolidationCadence(): Promise<AutoConsolidationCadence> {
  return getAutoConsolidationCadenceSync();
}

export async function setAutoConsolidationCadence(
  cadence: AutoConsolidationCadence,
): Promise<AutoConsolidationCadence> {
  return setAutoConsolidationCadenceSync(cadence);
}

export async function shouldShowAutoConsolidationIntro(): Promise<boolean> {
  return shouldShowAutoConsolidationIntroSync();
}

export async function markAutoConsolidationIntroShown(): Promise<void> {
  markAutoConsolidationIntroShownSync();
}

export function describeAutoConsolidationCadence(
  cadence: AutoConsolidationCadence,
): string {
  switch (cadence) {
    case 'daily':
      return 'daily at 03:00 local time';
    case 'weekly':
      return 'weekly on Sunday at 03:00 local time';
    case 'off':
      return 'off';
  }
}

export function getAutoConsolidationJobName(): string {
  return AUTO_CONSOLIDATION_JOB_NAME;
}

export function getAutoConsolidationCommand(): string {
  return 'sero memory consolidate --trigger cron';
}

export function syncAutoConsolidationCronJobSync(
  cadenceOverride?: AutoConsolidationCadence,
): AutoConsolidationSyncResult {
  const previousCadence = getAutoConsolidationCadenceSync();
  const cadence = cadenceOverride
    ? setAutoConsolidationCadenceSync(cadenceOverride)
    : previousCadence;
  const cronStatePath = resolveCronStatePath();
  const hadCronState = existsSync(cronStatePath);
  const currentState = readCronStateSync();
  const previousSerialized = JSON.stringify(currentState);
  const nextState: CronState = {
    ...currentState,
    jobs: [...currentState.jobs],
  };

  const existingIndex = nextState.jobs.findIndex((job) => job.name === AUTO_CONSOLIDATION_JOB_NAME);

  if (cadence === 'off') {
    if (existingIndex >= 0) {
      nextState.jobs.splice(existingIndex, 1);
    }
    if (nextState.jobs.length === 0 && nextState.reminders.length === 0) {
      nextState.autostart = false;
    }
  } else {
    const nextJob = buildAutoConsolidationJob(cadence);
    if (existingIndex >= 0) {
      nextState.jobs.splice(existingIndex, 1, nextJob);
    } else {
      nextState.jobs.push(nextJob);
    }
    nextState.autostart = true;
  }

  const nextSerialized = JSON.stringify(nextState);
  const cronChanged = nextSerialized !== previousSerialized || !hadCronState;
  if (cronChanged) {
    writeCronStateSync(nextState);
  }

  return {
    cadence,
    changed: cadence !== previousCadence || cronChanged,
    cronChanged,
    schedule: cadence === 'off'
      ? null
      : cadence === 'daily'
        ? DAILY_SCHEDULE
        : WEEKLY_SCHEDULE,
    autostart: nextState.autostart,
    cronStatePath,
  };
}

export async function syncAutoConsolidationCronJob(
  cadenceOverride?: AutoConsolidationCadence,
): Promise<AutoConsolidationSyncResult> {
  return syncAutoConsolidationCronJobSync(cadenceOverride);
}
