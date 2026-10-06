/**
 * The matched manifest for one scenario and replicate.
 *
 * One set of controlled inputs is built once and shared by both strategies, so
 * the only thing that can differ between the two records is the strategy. The
 * two run identities differ in run id and strategy alone.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  BaselineControlledInputs, BaselineRunIdentity, BaselineStrategy,
} from '../../../../plugins/sero-architect-plugin/runtime/baseline';
import { IGNORED_DIRECTORIES } from './checks';
import type { ScenarioDefinition } from './scenarios';

export const STRATEGIES: readonly BaselineStrategy[] = ['architect', 'persistent-single-agent'];

/**
 * What both candidates are authorized to do: read and edit files in the folder
 * and run shell commands there, and hand work to another agent. This is the
 * declared authority. The harness does not enforce or observe it per tool.
 */
export const AUTHORIZED_CAPABILITIES: readonly string[] = ['delegation', 'file-edit', 'file-read', 'shell'];

export interface PilotSettings {
  model: string;
  thinking: string;
  budgetUsd: number;
  budgetMinutes: number;
  /** One id for the whole pilot, so run ids from separate pilots never collide. */
  batchId: string;
}

export interface RunPlan {
  scenario: ScenarioDefinition['id'];
  replicate: number;
  inputs: BaselineControlledInputs;
  runs: Record<BaselineStrategy, BaselineRunIdentity>;
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** A hash over the sorted relative paths and contents of a folder, ignoring tool state. */
export function fingerprintFolder(folder: string): string {
  const entries: string[] = [];
  const walk = (dir: string): void => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_DIRECTORIES.has(item.name)) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full);
      else entries.push(path.relative(folder, full).split(path.sep).join('/'));
    }
  };
  walk(folder);
  const hash = createHash('sha256');
  for (const relative of entries.sort()) {
    hash.update(`${relative}\0${fs.readFileSync(path.join(folder, relative), 'utf8')}\0`);
  }
  return hash.digest('hex');
}

/** The fingerprint of a scenario's seed, taken by seeding a scratch folder. */
export function seedFingerprint(scenario: ScenarioDefinition): string {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-baseline-seed-'));
  try {
    scenario.seed(scratch);
    return fingerprintFolder(scratch);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/** The revision of the build under test. A dirty tree is named, never hidden. */
export function sourceRevision(): string {
  try {
    const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return `${git('rev-parse', '--short', 'HEAD')}${git('status', '--porcelain', '--untracked-files=no') ? '+dirty' : ''}`;
  } catch {
    return 'unknown';
  }
}

export function buildManifest(scenario: ScenarioDefinition, replicate: number, settings: PilotSettings, revision = sourceRevision()): RunPlan {
  const inputs: BaselineControlledInputs = {
    request: scenario.request,
    workspaceFingerprint: seedFingerprint(scenario),
    acceptanceRevision: sha256(JSON.stringify(scenario.checks)),
    model: settings.model,
    thinking: settings.thinking,
    capabilities: [...AUTHORIZED_CAPABILITIES].sort(),
    budgetUsd: settings.budgetUsd,
    budgetMinutes: settings.budgetMinutes,
    requiresIndependentReview: scenario.requiresIndependentReview,
  };
  const identity = (strategy: BaselineStrategy): BaselineRunIdentity => ({
    runId: `${settings.batchId}:${scenario.id}:r${replicate}:${strategy}`,
    strategy,
    revision,
    replicate,
  });
  return {
    scenario: scenario.id,
    replicate,
    inputs,
    runs: { architect: identity('architect'), 'persistent-single-agent': identity('persistent-single-agent') },
  };
}
