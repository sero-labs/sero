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
import { limitImgAllocations } from '@sero-ai/ink-and-bones';

// The LOAD-phase budget: while authored code builds the character it only
// paints part canvases (a whole reference character uses ~200k px), so a
// hoard dies at ~128 MB retained. The driver re-arms a budget measured from
// the validated clip set before the bake, where the engine's own transient
// canvases dominate.
limitImgAllocations(8_000_000);

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
// The whole object, not just .now — timeOrigin alone varies per process.
(globalThis as { performance: unknown }).performance = denyAll('performance');
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

interface Dims { canvasW: number; canvasH: number; groundRow: number }
interface Timing { cycle: number; bakeFps: number }

function contractProblems(
  spec: any,
  names: string[],
  clips: Map<string, unknown>,
  dims: Dims,
  timing: Map<string, Timing>,
): string[] {
  const problems: string[] = [];
  const wholeIn = (value: unknown, lo: number, hi: number): boolean =>
    typeof value === 'number' && Number.isInteger(value) && value >= lo && value <= hi;

  if (!wholeIn(dims.canvasW, MIN_CANVAS, MAX_CANVAS) || !wholeIn(dims.canvasH, MIN_CANVAS, MAX_CANVAS)) {
    problems.push('canvasW and canvasH must be whole numbers between ' + MIN_CANVAS + ' and ' + MAX_CANVAS + '.');
  }
  if (!wholeIn(dims.groundRow, 0, (Number.isInteger(dims.canvasH) ? dims.canvasH : MAX_CANVAS) - 1)) {
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
    const t = timing.get(name);
    if (t === undefined || !(t.cycle > 0) || t.cycle > MAX_CYCLE_SECONDS) {
      problems.push("clip '" + name + "' needs a cycle between 0 and " + MAX_CYCLE_SECONDS + ' seconds.');
      continue;
    }
    if (!Number.isFinite(t.bakeFps) || t.bakeFps <= 0 || t.bakeFps > 60) {
      problems.push("clip '" + name + "' needs a bakeFps in (0, 60].");
      continue;
    }
    const frames = Math.max(1, Math.round(t.cycle * t.bakeFps));
    const px = frames * (Number.isInteger(dims.canvasW) ? dims.canvasW : MAX_CANVAS) * (Number.isInteger(dims.canvasH) ? dims.canvasH : MAX_CANVAS);
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
  // A declared floor is an exception a squat character earns, not a dial to
  // turn down until the fill gate stops complaining; 0.25 is the lowest a
  // figure can be and still be a figure.
  if (spec.minFill !== undefined && !(typeof spec.minFill === 'number' && spec.minFill >= 0.25 && spec.minFill <= 1)) {
    problems.push('minFill, if declared, must be a number between 0.25 and 1 — the least of the canvas height the figure spans.');
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

  // Every scalar the budget and the bake depend on is read EXACTLY ONCE,
  // here, before any authored callback runs — a getter that answers small
  // to validation and large later changes nothing, because validation, the
  // budget, and the frozen spec all use these same reads. The engine's own
  // later reads are bounded by the armed budget.
  const dims = { canvasW: Number(spec.canvasW), canvasH: Number(spec.canvasH), groundRow: Number(spec.groundRow) };
  const timing = new Map<string, { cycle: number; bakeFps: number }>();
  for (const name of names) {
    const clip = clips.get(name) as { cycle?: unknown; bakeFps?: unknown } | null;
    if (clip !== null && typeof clip === 'object') {
      timing.set(name, { cycle: Number(clip.cycle), bakeFps: Number(clip.bakeFps) });
    }
  }

  const problems = contractProblems(spec, names, clips, dims, timing);
  if (problems.length > 0) {
    post({ ok: false, stage: 'contract', issues: problems.map((text) => ({ text })) });
    return;
  }

  // The bake must read the SAME timing the contract validated: pin each
  // clip's scalars onto the instance as non-writable data properties, so an
  // authored callback that later assigns to them throws (ESM is strict mode)
  // instead of quietly rewriting what was checked.
  for (const [name, t] of timing) {
    const clip = clips.get(name) as object;
    Object.defineProperty(clip, 'cycle', { value: t.cycle, writable: false, configurable: false });
    Object.defineProperty(clip, 'bakeFps', { value: t.bakeFps, writable: false, configurable: false });
    Object.defineProperty(clip, 'name', { value: name, writable: false, configurable: false });
    Object.defineProperty(clip, 'loop', {
      value: Boolean((clip as { loop?: unknown }).loop),
      writable: false,
      configurable: false,
    });
  }

  const frozen = {
    canvasW: dims.canvasW,
    canvasH: dims.canvasH,
    groundRow: dims.groundRow,
    skeleton: spec.skeleton,
    parts: Array.from(spec.parts),
    clips,
    grade: spec.grade,
    shadow: spec.shadow,
    // Every CharacterSpec field the engine reads must be carried onto the
    // frozen snapshot: one left behind is not an error, it is the DEFAULT
    // silently applied to a character that declared otherwise.
    ...(typeof spec.minFill === 'number' ? { minFill: spec.minFill } : {}),
    restPose: () => spec.restPose(),
  } as any;

  // Re-arm the allocation budget for the bake, measured from the validated
  // snapshot: per frame one supersampled canvas (16x the 1x pixels) plus the
  // 1x frame, doubled for margin, plus slack for the rest render. Armed
  // BEFORE restPose so no authored callback runs outside a budget it cannot
  // widen. Painter code that hoards during the bake dies near twice its
  // legitimate need instead of at a one-size ceiling.
  let bakePixels = 0;
  for (const t of timing.values()) {
    bakePixels += Math.max(1, Math.round(t.cycle * t.bakeFps)) * dims.canvasW * dims.canvasH * 17;
  }
  engine.limitImgAllocations(bakePixels * 2 + 8_000_000);

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
