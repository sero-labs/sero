/**
 * Checks that must hold before the strategy pilot spends any money. They need
 * no app and no model: they show the matched manifests are sound and that every
 * scenario's independent checks measure the delivered work, not the seed.
 *
 *   npx playwright test e2e/architect-baseline.contract.spec.ts --project=contract
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { BASELINE_SCENARIOS, controlledInputMismatches, outcomeFromChecks } from '../../../plugins/sero-architect-plugin/runtime/baseline';
import { runChecks } from './architect-baseline/checks';
import { buildManifest, fingerprintFolder, seedFingerprint, STRATEGIES } from './architect-baseline/manifest';
import { SCENARIOS, writeFiles } from './architect-baseline/scenarios';
import { resolveTier } from './architect-baseline/tier';

const SETTINGS = { model: 'provider/model', thinking: 'low', budgetUsd: 2, budgetMinutes: 20, batchId: 'contract' };
const REPLICATES = [1, 2];

function scratch(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sero-baseline-contract-'));
}

test('the scenarios cover every class once, and only one asks for independent review', () => {
  expect(SCENARIOS.map((scenario) => scenario.id).sort()).toEqual([...BASELINE_SCENARIOS].sort());
  expect(SCENARIOS.filter((scenario) => scenario.requiresIndependentReview).map((scenario) => scenario.id)).toEqual(['substantial-feature']);
});

test('both strategies share every controlled input and differ only in run identity', () => {
  for (const scenario of SCENARIOS) {
    for (const replicate of REPLICATES) {
      const plan = buildManifest(scenario, replicate, SETTINGS, 'abc123');
      const [first, second] = STRATEGIES.map((strategy) => plan.runs[strategy]);
      expect(controlledInputMismatches(plan.inputs, { ...plan.inputs }), `${scenario.id} r${replicate}`).toEqual([]);
      expect(first?.runId).not.toBe(second?.runId);
      expect(first?.strategy).not.toBe(second?.strategy);
      expect(first?.revision).toBe(second?.revision);
      expect(plan.inputs.request).toBe(scenario.request);
    }
  }
  const runIds = SCENARIOS.flatMap((scenario) => REPLICATES.flatMap((replicate) => Object.values(buildManifest(scenario, replicate, SETTINGS, 'abc123').runs).map((run) => run.runId)));
  expect(new Set(runIds).size).toBe(runIds.length);
});

test('a different model changes the controlled inputs, so a mismatch would be named', () => {
  const scenario = SCENARIOS[0]!;
  const a = buildManifest(scenario, 1, SETTINGS, 'abc123').inputs;
  const b = buildManifest(scenario, 1, { ...SETTINGS, model: 'other/model' }, 'abc123').inputs;
  expect(controlledInputMismatches(a, b)).toEqual(['model']);
});

test('seeding is deterministic', () => {
  for (const scenario of SCENARIOS) {
    const folders = [scratch(), scratch()];
    try {
      folders.forEach((folder) => scenario.seed(folder));
      expect(fingerprintFolder(folders[0]!), scenario.id).toBe(fingerprintFolder(folders[1]!));
      expect(seedFingerprint(scenario)).toBe(fingerprintFolder(folders[0]!));
    } finally {
      folders.forEach((folder) => fs.rmSync(folder, { recursive: true, force: true }));
    }
  }
});

test('every scenario rejects its untouched seed, so no check is vacuous', () => {
  for (const scenario of SCENARIOS) {
    const folder = scratch();
    try {
      scenario.seed(folder);
      const checks = runChecks(folder, scenario.checks);
      // A finished run that delivered nothing must be rejected, not accepted and not incomplete.
      expect(outcomeFromChecks(checks, true), `${scenario.id}: ${JSON.stringify(checks)}`).toBe('rejected');
      expect(checks.every((check) => check.passed !== null), scenario.id).toBe(true);
      expect(checks.filter((check) => check.passed === true), `${scenario.id} has a check the seed already passes`).toEqual([]);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  }
});

test('every scenario accepts a reference solution, so the hidden checks can be passed', () => {
  for (const scenario of SCENARIOS) {
    const folder = scratch();
    try {
      scenario.seed(folder);
      writeFiles(folder, scenario.reference);
      const checks = runChecks(folder, scenario.checks);
      expect(outcomeFromChecks(checks, true), `${scenario.id}: ${JSON.stringify(checks)}`).toBe('accepted');
      // The same delivered work is incomplete when the run did not finish.
      expect(outcomeFromChecks(checks, false)).toBe('incomplete');
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  }
});

test('a tier that does not resolve, or resolves to anthropic, refuses to start', () => {
  const settings = (entry: unknown) => ({ sero: { modelTiers: { LOW: entry } }, defaultThinkingLevel: 'medium' });
  expect(resolveTier(settings({ provider: 'deepseek', modelId: 'flash', thinkingLevel: 'High' }), 'LOW'))
    .toMatchObject({ model: 'deepseek/flash', thinking: 'high' });
  expect(resolveTier(settings({ provider: 'deepseek', modelId: 'flash' }), 'LOW').thinking).toBe('medium');
  expect(() => resolveTier(settings({ provider: 'anthropic', modelId: 'x' }), 'LOW')).toThrow(/never runs on anthropic/);
  expect(() => resolveTier(settings(undefined), 'LOW')).toThrow(/no model selected/);
  expect(() => resolveTier(settings({ provider: 'deepseek', modelId: 'flash' }), 'MED')).toThrow(/MED tier/);
});
