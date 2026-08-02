/**
 * The bake service: authored source in, audited frames and review strips out,
 * cached by content.
 *
 * The engine is deterministic (P5), so the cache key is the source plus the
 * engine version — the same pair the Godot original keyed its disk cache on
 * (asset source + core module sources). Same source, same engine: the bake is
 * read back instead of re-run. Only successes are cached; a failure is cheap
 * to reproduce and caching one would pin a transient host problem as if it
 * were a property of the source.
 */

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AuditCheck } from '@sero-ai/ink-and-bones';
import { ENGINE_VERSION, formatReport } from '@sero-ai/ink-and-bones';

import type { DesignLibraryPaths } from '../../../shared/paths';
import { puppetBakeDir, puppetBakesDir } from '../../shared/paths';
import type { CompileIssue } from './compile';
import { compilePuppetSource } from './compile';
import { renderReviewImages } from './images';
import { DEFAULT_RUN_TIMEOUT_MS, runPuppetBundle } from './run';

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
  engineVersion: string;
  canvasW: number;
  canvasH: number;
  groundRow: number;
  clips: PuppetClipReport[];
  /** Every audit check of every clip passed. The loop's convergence signal —
   * measured here, never taken from the author's word. */
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
  return path.join(dir, STRIPS_DIR, `${clip}.png`);
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

export interface PuppetBakeOptions {
  timeoutMs?: number;
}

export async function bakePuppetSource(
  paths: DesignLibraryPaths,
  source: string,
  options: PuppetBakeOptions = {},
): Promise<PuppetBakeOutcome> {
  const hash = puppetSourceHash(source);
  const dir = puppetBakeDir(paths, hash);

  const cached = await readFile(path.join(dir, REPORT_FILE), 'utf8').catch(() => null);
  if (cached !== null) {
    return { ok: true, hash, dir, report: JSON.parse(cached) as PuppetBakeReport, cached: true };
  }

  const compiled = await compilePuppetSource(source);
  if (!compiled.ok) return { ok: false, hash, stage: 'compile', issues: compiled.issues };

  const started = Date.now();
  const run = runPuppetBundle(compiled.code, options.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS);
  if (!run.ok) return { ok: false, hash, stage: run.stage, issues: run.issues };
  const { spec, baked, reports } = run.result;

  const report: PuppetBakeReport = {
    engineVersion: ENGINE_VERSION,
    canvasW: spec.canvasW,
    canvasH: spec.canvasH,
    groundRow: spec.groundRow,
    clips: reports.map((clip) => ({
      clip: clip.clip,
      frames: clip.frames,
      fps: baked.get(clip.clip)?.fps ?? 0,
      loop: baked.get(clip.clip)?.loop ?? false,
      failed: clip.failed,
      checks: clip.checks,
      info: clip.info,
    })),
    allClean: reports.every((clip) => clip.failed === 0),
    bakeMs: Date.now() - started,
    pretty: reports.map(formatReport).join('\n'),
  };

  // Build the directory beside its final name and move it into place whole, so
  // a reader never sees a bake with the report but not the strips. A rename
  // that loses the race to an identical bake is a cache hit, not a failure.
  const images = renderReviewImages(run.result);
  await mkdir(puppetBakesDir(paths), { recursive: true });
  const staging = await mkdtemp(path.join(puppetBakesDir(paths), `.${hash}-`));
  await mkdir(path.join(staging, STRIPS_DIR));
  await writeFile(path.join(staging, SOURCE_FILE), source, 'utf8');
  await writeFile(path.join(staging, REST_FILE), images.rest);
  for (const [clip, png] of images.strips) {
    await writeFile(stripFile(staging, clip), png);
  }
  await writeFile(path.join(staging, REPORT_FILE), JSON.stringify(report, null, 2), 'utf8');
  try {
    await rename(staging, dir);
  } catch {
    await rm(staging, { recursive: true, force: true });
  }
  return { ok: true, hash, dir, report, cached: false };
}
