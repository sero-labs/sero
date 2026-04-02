import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

function resolveSeroHome(): string {
  return process.env.SERO_HOME || path.join(os.homedir(), '.sero-ui');
}

function resolveAutomationStatePath(): string {
  return path.join(resolveSeroHome(), 'state', 'memory', 'automation.json');
}

function resolveCronStatePath(): string {
  return path.join(resolveSeroHome(), 'apps', 'cron', 'state.json');
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as T;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function normalizeCadence(value: unknown): AutoConsolidationCadence {
  return value === 'daily' || value === 'weekly' || value === 'off'
    ? value
    : DEFAULT_CADENCE;
}

function readAutomationStateSync(): MemoryAutomationState {
  return readJsonFile(resolveAutomationStatePath(), { ...DEFAULT_AUTOMATION_STATE });
}

function writeAutomationStateSync(state: MemoryAutomationState): void {
  writeJsonFile(resolveAutomationStatePath(), state);
}

function readCronStateSync(): CronState {
  const state = readJsonFile(resolveCronStatePath(), { ...DEFAULT_CRON_STATE });
  return {
    ...DEFAULT_CRON_STATE,
    ...state,
    jobs: Array.isArray(state.jobs) ? state.jobs : [],
    reminders: Array.isArray(state.reminders) ? state.reminders : [],
    lastRunResults: Array.isArray(state.lastRunResults) ? state.lastRunResults : [],
  };
}

function writeCronStateSync(state: CronState): void {
  writeJsonFile(resolveCronStatePath(), state);
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
  const cadence = cadenceOverride ? setAutoConsolidationCadenceSync(cadenceOverride) : previousCadence;
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
