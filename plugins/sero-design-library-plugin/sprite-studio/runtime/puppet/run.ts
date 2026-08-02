/**
 * Execute a compiled character and bake it, bounded.
 *
 * This is the one place generated code runs (P2: only the runtime executes a
 * character; the UI never does). The whole run — module load, buildCharacter,
 * every painter callback, the bake, the audits — happens synchronously inside
 * one `vm` script under a hard timeout. Node's watchdog terminates the whole
 * isolate's execution, host frames included, so an accidental `while (true)`
 * anywhere in the authored code ends as a structured error instead of a hung
 * runtime.
 *
 * The engine is handed in through the require shim rather than bundled, so a
 * character's objects are built by the runtime's own engine classes and
 * `instanceof` holds. The vm context has its OWN `Map`/`Array` primordials
 * though, so the contract checks duck-type containers instead of instanceof.
 */

import vm from 'node:vm';

import * as engine from '@sero-ai/ink-and-bones';
import type { AuditReport, BakedClip, CharacterSpec, Img } from '@sero-ai/ink-and-bones';

import type { CompileIssue } from './compile';
import { ENGINE_SPECIFIER } from './compile';

/** Bounds that keep one authored file from exhausting the runtime. They are
 * resource limits, not authoring rails: 160px is double the reference
 * character's canvas, and 5 s at the 60 Hz ceiling is a 300-frame clip. */
export const MAX_CANVAS = 160;
export const MIN_CANVAS = 16;
export const MAX_CLIPS = 12;
export const MAX_CYCLE_SECONDS = 5;
export const DEFAULT_RUN_TIMEOUT_MS = 30_000;

export interface PuppetBaked {
  spec: CharacterSpec;
  rest: Img;
  baked: Map<string, BakedClip>;
  reports: AuditReport[];
}

export type PuppetRunResult =
  | { ok: true; result: PuppetBaked }
  | { ok: false; stage: 'load' | 'contract'; issues: CompileIssue[] };

function contractProblems(spec: CharacterSpec): string[] {
  const problems: string[] = [];
  const wholeIn = (value: unknown, lo: number, hi: number): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= lo && value <= hi;

  if (!wholeIn(spec.canvasW, MIN_CANVAS, MAX_CANVAS) || !wholeIn(spec.canvasH, MIN_CANVAS, MAX_CANVAS)) {
    problems.push(`canvasW and canvasH must be whole numbers between ${MIN_CANVAS} and ${MAX_CANVAS}.`);
  }
  if (!wholeIn(spec.groundRow, 0, (typeof spec.canvasH === 'number' ? spec.canvasH : MAX_CANVAS) - 1)) {
    problems.push('groundRow must be a whole pixel row inside the canvas.');
  }
  if (!(spec.skeleton instanceof engine.Skeleton)) {
    problems.push('skeleton must be a Skeleton built with the engine API.');
  }
  if (!Array.isArray(spec.parts) || spec.parts.length === 0) {
    problems.push('parts must be a non-empty array, back-to-front.');
  } else {
    for (const part of spec.parts) {
      const rigid = 'bone' in part && 'paint' in part;
      const cloth = 'chain' in part && 'painter' in part;
      if (typeof part.name !== 'string' || (!rigid && !cloth) || !Array.isArray(part.ramp) || part.ramp.length === 0) {
        problems.push(`part '${String((part as { name?: unknown }).name)}' needs a name, a ramp, and either bone+paint or chain+painter.`);
      }
    }
  }
  const clips = spec.clips as unknown;
  if (
    clips === null ||
    typeof clips !== 'object' ||
    typeof (clips as Map<string, unknown>).get !== 'function' ||
    typeof (clips as Map<string, unknown>).size !== 'number'
  ) {
    problems.push('clips must be a Map from clip name to Motion.');
    return problems;
  }
  if (spec.clips.size === 0 || spec.clips.size > MAX_CLIPS) {
    problems.push(`clips must hold between 1 and ${MAX_CLIPS} clips.`);
  }
  for (const [name, clip] of spec.clips) {
    // Clip names become file names downstream (a strip per clip), so they are
    // held to one safe path segment here, where the author can act on it.
    if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)) {
      problems.push(`clip name '${String(name)}' must be letters, digits, '_' or '-' (max 64).`);
      continue;
    }
    if (!(clip instanceof engine.Motion)) {
      problems.push(`clip '${name}' must be a Motion built with the engine API.`);
    } else {
      if (clip.name !== name) {
        problems.push(`clip '${name}' is stored under a different name than its own ('${clip.name}').`);
      }
      if (!(clip.cycle > 0) || clip.cycle > MAX_CYCLE_SECONDS) {
        problems.push(`clip '${name}' needs a cycle between 0 and ${MAX_CYCLE_SECONDS} seconds.`);
      }
    }
  }
  if (typeof spec.grade !== 'object' || spec.grade === null || !Array.isArray(spec.grade.emissiveLone)) {
    problems.push('grade must declare ink, shadow, and an emissiveLone array (empty is fine).');
  }
  if (typeof spec.restPose !== 'function') {
    problems.push('restPose must be a function returning the standing pose.');
  }
  return problems;
}

function loadIssue(error: unknown): CompileIssue {
  // The watchdog's error is constructed such that `instanceof Error` cannot be
  // relied on across the vm boundary — match its code or its message.
  const code = (error as { code?: string }).code;
  if (code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' || String(error).includes('Script execution timed out')) {
    return {
      text:
        'The character took too long to build and bake — almost always an unbounded loop ' +
        'in the file. Every helper must finish; the engine provides all iteration.',
    };
  }
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const line = error instanceof Error ? /character\.js:(\d+)/.exec(error.stack ?? '')?.[1] : undefined;
  return { text, ...(line === undefined ? {} : { line: Number(line) }) };
}

/**
 * Run the compiled bundle: load, validate the contract, bake every clip, and
 * audit — all inside the timeout.
 */
export function runPuppetBundle(
  code: string,
  timeoutMs = DEFAULT_RUN_TIMEOUT_MS,
): PuppetRunResult {
  const moduleShim = { exports: {} as Record<string, unknown> };
  const requireShim = (specifier: string): unknown => {
    if (specifier === ENGINE_SPECIFIER) return engine;
    throw new Error(`'${specifier}' is not available to a character file.`);
  };

  // Everything below runs as host closures CALLED FROM a vm script, which
  // puts it under the script's timeout: V8's termination is isolate-wide, so
  // the watchdog reaches into engine and painter frames too.
  const context = vm.createContext({ module: moduleShim, exports: moduleShim.exports, require: requireShim });
  let contract: string[] = [];
  let out: PuppetBaked | null = null;
  const work = (): void => {
    const build = moduleShim.exports.buildCharacter;
    if (typeof build !== 'function') {
      contract = ["the file must export a function named 'buildCharacter' returning a CharacterSpec."];
      return;
    }
    const spec = build() as CharacterSpec;
    contract = contractProblems(spec);
    if (contract.length > 0) return;
    // Checked here rather than left to a TypeError deep in the compositor:
    // the flat-pose mistake is the most likely authored shape error.
    const pose = spec.restPose();
    if (typeof pose !== 'object' || pose === null || typeof pose.deg !== 'object' || pose.deg === null) {
      contract = ["restPose() must return { deg: { bone: deltaDeg } } — deltas live under 'deg'."];
      return;
    }
    const rest = engine.bakeRest(spec);
    const baked = engine.bakeAllClips(spec);
    const reports = [...baked.values()].map((clip) => engine.auditClip(spec, clip));
    out = { spec, rest, baked, reports };
  };
  (context as Record<string, unknown>).__work = work;

  try {
    new vm.Script(code, { filename: 'character.js' }).runInContext(context, { timeout: timeoutMs });
    new vm.Script('__work()', { filename: 'bake.js' }).runInContext(context, { timeout: timeoutMs });
  } catch (error) {
    return { ok: false, stage: 'load', issues: [loadIssue(error)] };
  }
  if (out === null) {
    return { ok: false, stage: 'contract', issues: contract.map((text) => ({ text })) };
  }
  return { ok: true, result: out };
}
