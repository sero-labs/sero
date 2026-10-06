/**
 * Independent acceptance checks for the baseline scenarios.
 *
 * A check is plain data and a deterministic look at the delivered workspace:
 * run a hidden test file, look for a required file, or compare a parsed JSON
 * block with a known answer. No model is called and no prose is matched, so the
 * same delivered files always give the same verdict whichever strategy made them.
 *
 * Hidden tests are copied into a throwaway copy of the workspace after the run.
 * The candidate never sees them, and the delivered folder is not changed.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BaselineAcceptanceCheck } from '../../../../plugins/sero-architect-plugin/runtime/baseline';

export type CheckDefinition =
  /** Runs each hidden test file with `node --test`. Passes when all of them pass. */
  | { id: string; summary: string; kind: 'node-test'; files: Record<string, string> }
  | { id: string; summary: string; kind: 'file-exists'; path: string }
  /** Compares the last ```json block of a file with the expected keys. Extra keys are allowed. */
  | { id: string; summary: string; kind: 'findings-block'; path: string; expected: Record<string, unknown> };

/** Folders that hold tool state, not the candidate's work. */
export const IGNORED_DIRECTORIES = new Set(['.git', '.sero', 'node_modules']);

const TEST_TIMEOUT_MS = 60_000;

/** Arrays compare as sets and objects by key, so only the answer matters, not its order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function copyWorkspace(from: string, to: string): void {
  fs.cpSync(from, to, {
    recursive: true,
    filter: (source) => !IGNORED_DIRECTORIES.has(path.basename(source)),
  });
}

function runNodeTests(folder: string, files: Record<string, string>): { passed: boolean | null; detail: string } {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-baseline-check-'));
  try {
    copyWorkspace(folder, scratch);
    const failures: string[] = [];
    for (const [file, source] of Object.entries(files)) {
      const target = path.join(scratch, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source, 'utf8');
      const result = spawnSync(process.execPath, ['--test', file], { cwd: scratch, encoding: 'utf8', timeout: TEST_TIMEOUT_MS });
      // A process that could not start says nothing about the work, so it is not a failure.
      if (result.error) return { passed: null, detail: `could not run ${file}: ${result.error.message}` };
      if (result.status !== 0) failures.push(`${file} exited ${String(result.status)}: ${firstFailure(result.stdout)}`);
    }
    return failures.length === 0
      ? { passed: true, detail: `${Object.keys(files).length} hidden test file(s) passed` }
      : { passed: false, detail: failures.join(' | ') };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/** The first failing test name from node's TAP-like output, to say what broke. */
function firstFailure(output: string): string {
  const line = output.split('\n').find((entry) => entry.trimStart().startsWith('not ok'));
  return line?.trim().slice(0, 160) ?? 'no failing test name in the output';
}

function readFindings(file: string): { passed: boolean | null; detail: string; block?: Record<string, unknown> } {
  if (!fs.existsSync(file)) return { passed: false, detail: 'the findings file does not exist' };
  const fences = [...fs.readFileSync(file, 'utf8').matchAll(/```json\s*\n([\s\S]*?)```/g)];
  const last = fences.at(-1)?.[1];
  if (last === undefined) return { passed: false, detail: 'the findings file has no json block' };
  try {
    const parsed: unknown = JSON.parse(last);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { passed: true, detail: 'parsed', block: parsed as Record<string, unknown> };
    return { passed: false, detail: 'the json block is not an object' };
  } catch (error) {
    return { passed: false, detail: `the json block does not parse: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function runCheck(folder: string, check: CheckDefinition): BaselineAcceptanceCheck {
  try {
    if (check.kind === 'file-exists') {
      const found = fs.existsSync(path.join(folder, check.path));
      return { id: check.id, passed: found, detail: found ? `${check.path} exists` : `${check.path} is missing` };
    }
    if (check.kind === 'node-test') return { id: check.id, ...runNodeTests(folder, check.files) };
    const findings = readFindings(path.join(folder, check.path));
    if (!findings.block) return { id: check.id, passed: findings.passed, detail: findings.detail };
    const wrong = Object.keys(check.expected).filter((key) =>
      JSON.stringify(canonical(findings.block?.[key])) !== JSON.stringify(canonical(check.expected[key])));
    return { id: check.id, passed: wrong.length === 0, detail: wrong.length === 0 ? 'every expected answer matches' : `these answers differ from the known ones: ${wrong.join(', ')}` };
  } catch (error) {
    // A check that blew up did not observe the result. null keeps the run incomplete.
    return { id: check.id, passed: null, detail: `the check could not run: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function runChecks(folder: string, checks: readonly CheckDefinition[]): BaselineAcceptanceCheck[] {
  return checks.map((check) => runCheck(folder, check));
}
