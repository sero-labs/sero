/**
 * The source of the two modules bundled AROUND the authored character: the
 * determinism stubs, evaluated before the character module can run a line,
 * and the driver that builds, validates, bakes, audits and posts the result.
 * Both run inside the bake worker's own isolate with the worker's own engine
 * copy — nothing here executes in the runtime process.
 *
 * Written as template strings (no backticks inside, so nothing needs
 * escaping); the resource caps are interpolated from the constants below so
 * the parent and the worker can never disagree about them.
 */

/** Bounds that keep one authored file from exhausting the worker. Resource
 * limits, not authoring rails: 160px is double the reference canvas, a
 * 5 s cycle at the 60 Hz ceiling is a 300-frame clip, and the pixel caps
 * allow the reference character's whole clip set thirty times over. */
export const MAX_CANVAS = 160;
export const MIN_CANVAS = 16;
export const MAX_CLIPS = 12;
export const MAX_CYCLE_SECONDS = 5;
/** frames x canvas pixels, per clip and per character. */
export const MAX_CLIP_PIXELS = 1_600_000;
export const MAX_TOTAL_PIXELS = 6_400_000;
/** One safe path segment; clip names become strip file names. */
export const CLIP_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** Evaluated before the authored module (P5: determinism is a contract).
 * A clock read or a random draw fails loudly instead of making two bakes of
 * the same source disagree — which would poison the content-addressed cache. */
export const DETERMINISM_SOURCE = `
const refuse = (what: string) => {
  throw new Error(
    'Ink & Bones characters are deterministic: ' + what + ' is not available. ' +
    'Derive all motion from the clip time; there is no clock and no randomness.',
  );
};
const denyAll = (what: string) =>
  new Proxy(function () {}, {
    apply: () => refuse(what + '()'),
    construct: () => refuse('new ' + what + '()'),
    get: (_target, prop) => {
      // Symbol lookups happen during ordinary printing/coercion; only real
      // API reads (Date.now, crypto.getRandomValues, process.env) refuse.
      if (typeof prop === 'symbol' || prop === 'prototype') return undefined;
      refuse(what + '.' + String(prop));
    },
  });
Math.random = () => refuse('Math.random()') as never;
(globalThis as { Date: unknown }).Date = denyAll('Date');
(globalThis as { process: unknown }).process = denyAll('process');
try {
  Object.defineProperty(globalThis, 'crypto', { value: denyAll('crypto'), configurable: true });
} catch { /* an engine without a configurable crypto simply keeps it */ }
if (typeof performance !== 'undefined') {
  (performance as { now: () => number }).now = () => refuse('performance.now()') as never;
}
export {};
`;

export const DRIVER_SOURCE = `
import { parentPort } from 'node:worker_threads';
import './determinism';
import * as engine from '@sero-ai/ink-and-bones';
import * as character from './character';

const MAX_CANVAS = ${MAX_CANVAS};
const MIN_CANVAS = ${MIN_CANVAS};
const MAX_CLIPS = ${MAX_CLIPS};
const MAX_CYCLE_SECONDS = ${MAX_CYCLE_SECONDS};
const MAX_CLIP_PIXELS = ${MAX_CLIP_PIXELS};
const MAX_TOTAL_PIXELS = ${MAX_TOTAL_PIXELS};
const CLIP_NAME = ${CLIP_NAME_PATTERN.toString()};

function post(message: unknown): void {
  parentPort!.postMessage(message);
}

function packImg(img: { w: number; h: number; data: Float32Array }) {
  return { w: img.w, h: img.h, data: img.data };
}

function contractProblems(spec: any, names: string[], clips: Map<string, unknown>): string[] {
  const problems: string[] = [];
  const wholeIn = (value: unknown, lo: number, hi: number): boolean =>
    typeof value === 'number' && Number.isInteger(value) && value >= lo && value <= hi;

  if (!wholeIn(spec.canvasW, MIN_CANVAS, MAX_CANVAS) || !wholeIn(spec.canvasH, MIN_CANVAS, MAX_CANVAS)) {
    problems.push('canvasW and canvasH must be whole numbers between ' + MIN_CANVAS + ' and ' + MAX_CANVAS + '.');
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
      const rigid = part !== null && typeof part === 'object' && 'bone' in part && 'paint' in part;
      const cloth = part !== null && typeof part === 'object' && 'chain' in part && 'painter' in part;
      if (!rigid && !cloth || typeof part.name !== 'string' || !Array.isArray(part.ramp) || part.ramp.length === 0) {
        problems.push("part '" + String(part && part.name) + "' needs a name, a ramp, and either bone+paint or chain+painter.");
      }
    }
  }
  if (names.length === 0 || names.length > MAX_CLIPS) {
    problems.push('clips must hold between 1 and ' + MAX_CLIPS + ' clips.');
  }
  let totalPixels = 0;
  for (const name of names) {
    const clip = clips.get(name) as any;
    if (typeof name !== 'string' || !CLIP_NAME.test(name)) {
      problems.push("clip name '" + String(name) + "' must be letters, digits, '_' or '-' (max 64).");
      continue;
    }
    if (!(clip instanceof engine.Motion)) {
      problems.push("clip '" + name + "' must be a Motion built with the engine API.");
      continue;
    }
    if (clip.name !== name) {
      problems.push("clip '" + name + "' is stored under a different name than its own ('" + clip.name + "').");
    }
    if (!(clip.cycle > 0) || clip.cycle > MAX_CYCLE_SECONDS) {
      problems.push("clip '" + name + "' needs a cycle between 0 and " + MAX_CYCLE_SECONDS + ' seconds.');
      continue;
    }
    if (!Number.isFinite(clip.bakeFps) || clip.bakeFps <= 0 || clip.bakeFps > 60) {
      problems.push("clip '" + name + "' needs a bakeFps in (0, 60].");
      continue;
    }
    const frames = Math.max(1, Math.round(clip.cycle * clip.bakeFps));
    const px = frames * (typeof spec.canvasW === 'number' ? spec.canvasW : MAX_CANVAS) * (typeof spec.canvasH === 'number' ? spec.canvasH : MAX_CANVAS);
    if (px > MAX_CLIP_PIXELS) {
      problems.push("clip '" + name + "' bakes " + frames + ' frames — beyond the per-clip budget. Shorten the cycle or lower bakeFps.');
    }
    totalPixels += px;
  }
  if (totalPixels > MAX_TOTAL_PIXELS) {
    problems.push('the clip set together bakes beyond the character budget — fewer or shorter clips.');
  }
  if (spec.grade === null || typeof spec.grade !== 'object' || !Array.isArray(spec.grade.emissiveLone)) {
    problems.push('grade must declare ink, shadow, and an emissiveLone array (empty is fine).');
  }
  if (typeof spec.restPose !== 'function') {
    problems.push('restPose must be a function returning the standing pose.');
  }
  return problems;
}

function main(): void {
  const build = (character as { buildCharacter?: unknown }).buildCharacter;
  if (typeof build !== 'function') {
    post({ ok: false, stage: 'contract', issues: [{ text: "the file must export a function named 'buildCharacter' returning a CharacterSpec." }] });
    return;
  }
  const spec = (build as () => any)();
  if (spec === null || typeof spec !== 'object' || spec.clips === null || typeof spec.clips !== 'object' || typeof spec.clips[Symbol.iterator] !== 'function') {
    post({ ok: false, stage: 'contract', issues: [{ text: 'buildCharacter must return a CharacterSpec whose clips is a Map from clip name to Motion.' }] });
    return;
  }

  // One snapshot, taken once, used for everything after — a clips object that
  // answers differently on a second read changes nothing.
  const clips = new Map<string, unknown>();
  const names: string[] = [];
  for (const entry of spec.clips as Iterable<[string, unknown]>) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    if (!clips.has(entry[0])) {
      names.push(entry[0]);
      clips.set(entry[0], entry[1]);
    }
  }

  const problems = contractProblems(spec, names, clips);
  if (problems.length > 0) {
    post({ ok: false, stage: 'contract', issues: problems.map((text) => ({ text })) });
    return;
  }

  const frozen = {
    canvasW: spec.canvasW,
    canvasH: spec.canvasH,
    groundRow: spec.groundRow,
    skeleton: spec.skeleton,
    parts: Array.from(spec.parts),
    clips,
    grade: spec.grade,
    shadow: spec.shadow,
    restPose: () => spec.restPose(),
  } as any;

  const pose = frozen.restPose();
  if (pose === null || typeof pose !== 'object' || pose.deg === null || typeof pose.deg !== 'object') {
    post({ ok: false, stage: 'contract', issues: [{ text: "restPose() must return { deg: { bone: deltaDeg } } — deltas live under 'deg'." }] });
    return;
  }

  const rest = engine.bakeRest(frozen);
  const baked: { name: string; fps: number; loop: boolean; frames: ReturnType<typeof packImg>[] }[] = [];
  const reports: unknown[] = [];
  for (const name of names) {
    const clip = engine.bakeClip(frozen, name);
    reports.push(engine.auditClip(frozen, clip));
    baked.push({ name, fps: clip.fps, loop: clip.loop, frames: clip.frames.map(packImg) });
  }
  if (reports.length !== names.length || reports.length === 0) {
    post({ ok: false, stage: 'contract', issues: [{ text: 'the bake produced no auditable clips.' }] });
    return;
  }

  post({
    ok: true,
    summary: {
      canvasW: frozen.canvasW,
      canvasH: frozen.canvasH,
      groundRow: frozen.groundRow,
      restFeetRow: engine.stats(rest, frozen.grade.ink).feet,
    },
    rest: packImg(rest),
    clips: baked,
    reports,
  });
}

try {
  main();
} catch (error) {
  post({
    ok: false,
    stage: 'load',
    issues: [{ text: error instanceof Error ? error.name + ': ' + error.message : String(error) }],
  });
}
`;
