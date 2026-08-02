/**
 * Execute a compiled character bundle in a worker thread and bring the bake
 * home.
 *
 * This is the one place generated code runs (P2: only the runtime executes a
 * character; the UI never does). Each bake gets a fresh worker: its own
 * isolate, its own engine copy, a memory ceiling from `resourceLimits`, and a
 * parent-enforced deadline that ends in `terminate()` — which kills straight
 * loops, microtask floods and stray timers alike, none of which a `vm`
 * timeout could reach. What this bounds: hangs and timer/microtask floods
 * (terminated), JS-heap blowups (`resourceLimits`), engine-surface
 * allocations (`Img` refuses absurd canvases, and every engine pixel buffer
 * is an `Img`), and poisoned engine prototypes (die with the worker). What it
 * does NOT bound: raw typed-array floods in authored code, which only the
 * deadline cuts short — and deliberately hostile code generally, for which
 * the honest line is OS-level isolation, on the record as a Phase 2
 * decision in the plan.
 *
 * The worker's reply is DATA, not trusted structure: the parent re-validates
 * names, sizes and report shape, recomputes every failure count, and rebuilds
 * real `Img`s before anything downstream sees the result.
 */

import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

import type { AuditCheck, AuditCheckId, AuditReport, BakedClip } from '@sero-ai/ink-and-bones';
import { Img } from '@sero-ai/ink-and-bones';

import type { CompileIssue } from './compile';
import { CLIP_NAME_PATTERN, MAX_CLIPS, MAX_CLIP_PIXELS, MAX_TOTAL_PIXELS } from './driver';

export const DEFAULT_RUN_TIMEOUT_MS = 30_000;
/** Generous for a real character (the reference bake peaks far below it);
 * small enough that a runaway allocation dies in the worker, not the app. */
export const WORKER_MEMORY_MB = 512;

export interface PuppetSummary {
  canvasW: number;
  canvasH: number;
  groundRow: number;
  /** The rest frame's lowest opaque row, outline included — the measurement
   * the declared groundRow is supposed to be. */
  restFeetRow: number;
}

export interface PuppetBaked {
  summary: PuppetSummary;
  rest: Img;
  baked: Map<string, BakedClip>;
  reports: AuditReport[];
}

export type PuppetRunResult =
  | { ok: true; result: PuppetBaked }
  | { ok: false; stage: 'load' | 'contract'; issues: CompileIssue[] };

export interface PuppetRunOptions {
  timeoutMs?: number;
  memoryMb?: number;
  signal?: AbortSignal;
}

interface PackedImg {
  w: number;
  h: number;
  data: Float32Array;
}

export const AUDIT_IDS: readonly AuditCheckId[] = [
  'valid',
  'distinct',
  'wrap',
  'islands',
  'in-place',
  'baseline',
  'edge',
  'speckle',
  'ramp',
];

function loadFailure(text: string): PuppetRunResult {
  return { ok: false, stage: 'load', issues: [{ text }] };
}

function unpackImg(raw: unknown, maxPixels: number): Img | null {
  const packed = raw as PackedImg;
  if (
    typeof packed?.w !== 'number' ||
    typeof packed.h !== 'number' ||
    !(packed.data instanceof Float32Array) ||
    packed.w < 1 ||
    packed.h < 1 ||
    packed.w * packed.h > maxPixels ||
    packed.data.length !== packed.w * packed.h * 4
  ) {
    return null;
  }
  const img = new Img(packed.w, packed.h);
  img.data.set(packed.data);
  return img;
}

function unpackReport(raw: unknown): AuditReport | null {
  const report = raw as AuditReport;
  if (typeof report?.clip !== 'string' || typeof report.frames !== 'number' || !Array.isArray(report.checks)) {
    return null;
  }
  const checks: AuditCheck[] = [];
  for (const check of report.checks) {
    if (!AUDIT_IDS.includes(check?.id) || typeof check.ok !== 'boolean' || typeof check.text !== 'string') {
      return null;
    }
    checks.push({ id: check.id, ok: check.ok, text: check.text.slice(0, 500) });
  }
  const info = Array.isArray(report.info)
    ? report.info.filter((line): line is string => typeof line === 'string').map((line) => line.slice(0, 500))
    : [];
  // `failed` is recomputed, never read: a count that disagreed with the
  // checks would decide convergence, and it arrives from generated code.
  return {
    clip: report.clip,
    frames: report.frames,
    checks,
    failed: checks.filter((check) => !check.ok).length,
    info,
  };
}

/** Validate and rebuild the worker's reply. Null means it was malformed. */
function parseSuccess(raw: Record<string, unknown>): PuppetBaked | null {
  const summary = raw.summary as PuppetSummary;
  if (
    typeof summary?.canvasW !== 'number' ||
    typeof summary.canvasH !== 'number' ||
    typeof summary.groundRow !== 'number' ||
    typeof summary.restFeetRow !== 'number'
  ) {
    return null;
  }
  const rest = unpackImg(raw.rest, MAX_CLIP_PIXELS);
  if (rest === null) return null;

  const clipsRaw = raw.clips;
  const reportsRaw = raw.reports;
  if (!Array.isArray(clipsRaw) || !Array.isArray(reportsRaw)) return null;
  if (clipsRaw.length === 0 || clipsRaw.length > MAX_CLIPS || clipsRaw.length !== reportsRaw.length) return null;

  let totalPixels = 0;
  const baked = new Map<string, BakedClip>();
  for (const clipRaw of clipsRaw) {
    const clip = clipRaw as { name: string; fps: number; loop: boolean; frames: unknown[] };
    if (
      typeof clip?.name !== 'string' ||
      !CLIP_NAME_PATTERN.test(clip.name) ||
      baked.has(clip.name) ||
      typeof clip.fps !== 'number' ||
      typeof clip.loop !== 'boolean' ||
      !Array.isArray(clip.frames) ||
      clip.frames.length === 0
    ) {
      return null;
    }
    const frames: Img[] = [];
    for (const frameRaw of clip.frames) {
      const frame = unpackImg(frameRaw, MAX_CLIP_PIXELS);
      if (frame === null) return null;
      totalPixels += frame.w * frame.h;
      frames.push(frame);
    }
    baked.set(clip.name, { name: clip.name, frames, fps: clip.fps, loop: clip.loop });
  }
  if (totalPixels > MAX_TOTAL_PIXELS) return null;

  const reports: AuditReport[] = [];
  for (const reportRaw of reportsRaw) {
    const report = unpackReport(reportRaw);
    if (report === null || !baked.has(report.clip)) return null;
    reports.push(report);
  }
  return { summary, rest, baked, reports };
}

let workerSerial = 0;

/**
 * Run the bundle to completion in its own worker. `workDir` must exist and
 * belong to the caller; the bundle file is removed on the way out.
 */
export async function runPuppetWorker(
  code: string,
  workDir: string,
  options: PuppetRunOptions = {},
): Promise<PuppetRunResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
  const memoryMb = options.memoryMb ?? WORKER_MEMORY_MB;
  if (options.signal?.aborted) return loadFailure('Aborted');

  const file = path.join(workDir, `worker-${process.pid}-${workerSerial++}.mjs`);
  await writeFile(file, code, 'utf8');
  const worker = new Worker(pathToFileURL(file), {
    resourceLimits: { maxOldGenerationSizeMb: memoryMb },
  });

  let settle: (result: PuppetRunResult) => void = () => undefined;
  const settled = new Promise<PuppetRunResult>((resolve) => {
    settle = (result) => resolve(result);
  });

  const timer = setTimeout(() => {
    settle(
      loadFailure(
        'The character took too long to build and bake — almost always an unbounded ' +
          'loop in the file. Every helper must finish; the engine provides all iteration.',
      ),
    );
  }, timeoutMs);
  const onAbort = (): void => {
    settle(loadFailure('Aborted'));
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });

  worker.on('message', (raw: unknown) => {
    const message = raw as Record<string, unknown> | null;
    if (message === null || typeof message !== 'object') {
      settle(loadFailure('The bake returned something unreadable.'));
      return;
    }
    if (message.ok !== true) {
      const stage = message.stage === 'contract' ? 'contract' : 'load';
      const issues = Array.isArray(message.issues)
        ? message.issues
            .filter((issue): issue is { text: string } => typeof (issue as { text?: unknown })?.text === 'string')
            .map((issue) => ({ text: issue.text.slice(0, 2000) }))
        : [];
      settle({ ok: false, stage, issues: issues.length > 0 ? issues : [{ text: 'The bake failed without a reason.' }] });
      return;
    }
    const parsed = parseSuccess(message);
    settle(
      parsed === null
        ? loadFailure('The bake returned a malformed result — the character file likely tampered with the engine.')
        : { ok: true, result: parsed },
    );
  });
  worker.on('error', (error: NodeJS.ErrnoException) => {
    settle(
      error.code === 'ERR_WORKER_OUT_OF_MEMORY'
        ? loadFailure(
            `The character ran out of memory (${memoryMb} MB budget) — an unbounded allocation somewhere in the file.`,
          )
        : loadFailure(error instanceof Error ? `${error.name}: ${error.message}` : String(error)),
    );
  });
  worker.on('exit', () => {
    settle(loadFailure('The bake crashed before returning a result.'));
  });

  try {
    return await settled;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
    await worker.terminate().catch(() => undefined);
    await rm(file, { force: true }).catch(() => undefined);
  }
}
