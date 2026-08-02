/**
 * The bake service: authored source in, audited frames and review strips out,
 * cached by content.
 *
 * The engine is deterministic (P5), so the cache key is the source plus the
 * engine version — the same pair the Godot original keyed its disk cache on.
 * A cache hit is NOT taken on faith: the stored report must carry the current
 * format and engine version, the stored source must re-hash to the directory
 * name, and every review image must still exist — anything less is treated as
 * a miss and rebuilt, because a stale or hand-edited report would otherwise
 * decide convergence. Only successes are cached; a failure is cheap to
 * reproduce and caching one would pin a transient host problem as if it were
 * a property of the source.
 */

import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AuditCheck } from '@sero-ai/ink-and-bones';
import { ENGINE_VERSION, formatReport } from '@sero-ai/ink-and-bones';

import type { DesignLibraryPaths } from '../../../shared/paths';
import { puppetBakeDir, puppetBakesDir } from '../../shared/paths';
import type { CompileIssue } from './compile';
import { compilePuppetWorker } from './compile';
import { CLIP_NAME_PATTERN, DETERMINISM_SOURCE, DRIVER_SOURCE } from './driver';
import { renderReviewImages } from './images';
import { DEFAULT_RUN_TIMEOUT_MS, runPuppetWorker } from './run';

/** Bumped whenever the stored report shape changes; a mismatch is a miss. */
export const BAKE_FORMAT_VERSION = 2;

export interface PuppetClipReport {
  clip: string;
  frames: number;
  fps: number;
  loop: boolean;
  failed: number;
  checks: AuditCheck[];
  info: string[];
}

export interface PuppetBakeReport {
  version: number;
  engineVersion: string;
  canvasW: number;
  canvasH: number;
  groundRow: number;
  /** Measured off the baked rest frame, outline included — what groundRow
   * is supposed to be declared as. */
  restFeetRow: number;
  clips: PuppetClipReport[];
  /** Every audit check of every clip passed. The loop's convergence signal —
   * measured here from the checks themselves, never taken from a count. */
  allClean: boolean;
  bakeMs: number;
  /** The Godot-style ok/FAIL lines — the text the author reads back. */
  pretty: string;
}

export type PuppetBakeOutcome =
  | { ok: true; hash: string; dir: string; report: PuppetBakeReport; cached: boolean }
  | { ok: false; hash: string; stage: 'compile' | 'load' | 'contract'; issues: CompileIssue[] };

export function puppetSourceHash(source: string): string {
  return createHash('sha256').update(`${ENGINE_VERSION}\0${source}`).digest('hex').slice(0, 32);
}

export const REPORT_FILE = 'report.json';
export const SOURCE_FILE = 'source.ts';
export const REST_FILE = 'rest.png';
export const STRIPS_DIR = 'strips';

export function stripFile(dir: string, clip: string): string {
  // Clip names are validated at the contract AND here: they cross a process
  // boundary as data on the way back, and they become path segments.
  if (!CLIP_NAME_PATTERN.test(clip)) {
    throw new Error(`Refusing '${clip}' as a strip file name.`);
  }
  return path.join(dir, STRIPS_DIR, `${clip}.png`);
}

/** A stored report believed only after it proves it is ours, current, and
 * still complete on disk. */
async function readValidCache(dir: string, hash: string): Promise<PuppetBakeReport | null> {
  const raw = await readFile(path.join(dir, REPORT_FILE), 'utf8').catch(() => null);
  if (raw === null) return null;
  let report: PuppetBakeReport;
  try {
    report = JSON.parse(raw) as PuppetBakeReport;
  } catch {
    return null;
  }
  if (
    report?.version !== BAKE_FORMAT_VERSION ||
    report.engineVersion !== ENGINE_VERSION ||
    !Array.isArray(report.clips) ||
    report.clips.length === 0 ||
    report.clips.some((clip) => typeof clip?.clip !== 'string' || !CLIP_NAME_PATTERN.test(clip.clip) || !Array.isArray(clip.checks))
  ) {
    return null;
  }
  const source = await readFile(path.join(dir, SOURCE_FILE), 'utf8').catch(() => null);
  if (source === null || puppetSourceHash(source) !== hash) return null;
  const files = [path.join(dir, REST_FILE), ...report.clips.map((clip) => stripFile(dir, clip.clip))];
  for (const file of files) {
    const present = await access(file).then(
      () => true,
      () => false,
    );
    if (!present) return null;
  }
  // The convergence signal is recomputed from the checks, not read.
  const allClean =
    report.clips.length > 0 &&
    report.clips.every((clip) => clip.checks.every((check) => check?.ok === true));
  return { ...report, allClean };
}

export interface PuppetBakeOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function bakePuppetSource(
  paths: DesignLibraryPaths,
  source: string,
  options: PuppetBakeOptions = {},
): Promise<PuppetBakeOutcome> {
  return bakeOnce(paths, source, options, false);
}

async function bakeOnce(
  paths: DesignLibraryPaths,
  source: string,
  options: PuppetBakeOptions,
  retried: boolean,
): Promise<PuppetBakeOutcome> {
  const hash = puppetSourceHash(source);
  const dir = puppetBakeDir(paths, hash);

  const cached = await readValidCache(dir, hash);
  if (cached !== null) return { ok: true, hash, dir, report: cached, cached: true };
  // Whatever sits at the target failed validation (or is half of something) —
  // clear it so the finished bake can move into place. Rebuilding a bake this
  // might race is harmless: same source, same frames.
  await rm(dir, { recursive: true, force: true });

  const compiled = await compilePuppetWorker({
    character: source,
    driver: DRIVER_SOURCE,
    determinism: DETERMINISM_SOURCE,
  });
  if (!compiled.ok) return { ok: false, hash, stage: 'compile', issues: compiled.issues };

  await mkdir(puppetBakesDir(paths), { recursive: true });
  const staging = await mkdtemp(path.join(puppetBakesDir(paths), `.${hash}-`));
  try {
    const started = Date.now();
    const run = await runPuppetWorker(compiled.code, staging, {
      ...(options.timeoutMs === undefined ? { timeoutMs: DEFAULT_RUN_TIMEOUT_MS } : { timeoutMs: options.timeoutMs }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (!run.ok) return { ok: false, hash, stage: run.stage, issues: run.issues };
    const { summary, baked, reports } = run.result;

    const report: PuppetBakeReport = {
      version: BAKE_FORMAT_VERSION,
      engineVersion: ENGINE_VERSION,
      canvasW: summary.canvasW,
      canvasH: summary.canvasH,
      groundRow: summary.groundRow,
      restFeetRow: summary.restFeetRow,
      clips: reports.map((clip) => ({
        clip: clip.clip,
        frames: clip.frames,
        fps: baked.get(clip.clip)?.fps ?? 0,
        loop: baked.get(clip.clip)?.loop ?? false,
        failed: clip.failed,
        checks: clip.checks,
        info: clip.info,
      })),
      allClean: reports.length > 0 && reports.every((clip) => clip.failed === 0),
      bakeMs: Date.now() - started,
      pretty: reports.map(formatReport).join('\n'),
    };

    // Build the directory beside its final name and move it into place whole,
    // so a reader never sees a bake with the report but not the strips.
    const images = renderReviewImages(run.result);
    await mkdir(path.join(staging, STRIPS_DIR));
    await writeFile(path.join(staging, SOURCE_FILE), source, 'utf8');
    await writeFile(path.join(staging, REST_FILE), images.rest);
    for (const [clip, png] of images.strips) {
      await writeFile(stripFile(staging, clip), png);
    }
    await writeFile(path.join(staging, REPORT_FILE), JSON.stringify(report, null, 2), 'utf8');
    try {
      await rename(staging, dir);
    } catch (error) {
      // Only a lost race to an identical bake is survivable: the winner's
      // result must exist and validate, and then it IS the result. Anything
      // else is a real error and is thrown, not swallowed as success.
      const winner = await readValidCache(dir, hash);
      if (winner !== null) return { ok: true, hash, dir, report: winner, cached: true };
      if (!retried) return bakeOnce(paths, source, options, true);
      throw error;
    }
    return { ok: true, hash, dir, report, cached: false };
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** The review pictures of a finished bake, read back off the bake directory —
 * the same files whether the bake just ran or was a cache hit. */
export async function readReviewPngs(
  dir: string,
  report: PuppetBakeReport,
): Promise<{ rest: Buffer; strips: Map<string, Buffer> }> {
  const strips = new Map<string, Buffer>();
  for (const clip of report.clips) {
    strips.set(clip.clip, await readFile(stripFile(dir, clip.clip)));
  }
  return { rest: await readFile(path.join(dir, REST_FILE)), strips };
}
