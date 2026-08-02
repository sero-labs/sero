/**
 * The audit gates: every clip, every frame, headless. Ported from
 * tools/puppet_audit.gd. These are properties of a bake — any consumer can
 * run them — and they are the authoring loop's hard feedback signal, so the
 * texts name the failure the way a fixer needs to hear it.
 *
 * Per clip:
 *   valid      the bake is worth measuring at all — frames exist, and every
 *              frame is exactly the declared canvas (a vacuous pass on an
 *              empty clip would be the worst kind of green)
 *   distinct   every frame differs from its predecessor
 *   wrap       the last frame flows into frame 0 (loops only)
 *   islands    the silhouette stays one connected mass
 *   in-place   centroid wobble around the clip's own mean stays in budget
 *   baseline   feet on the ground (airborne-aware, vs the declared groundRow)
 *   edge       no fill on the top/left/right canvas boundary
 *   speckle    the despeckle grade rule held — no lone off-palette pixels
 *   ramp       every colour is in the character's derived vocabulary
 */

import { changed, cxWobble, edgeFill, offVocabPx, pocketPx, specklePx, stats } from './metrics';
import type { CharacterSpec } from './spec';
import { bakeAllClips, vocabulary } from './spec';
import type { BakedClip } from './spec';

export type AuditCheckId =
  | 'valid'
  | 'distinct'
  | 'wrap'
  | 'islands'
  | 'in-place'
  | 'baseline'
  | 'edge'
  | 'speckle'
  | 'ramp';

export interface AuditCheck {
  id: AuditCheckId;
  ok: boolean;
  text: string;
}

export interface AuditReport {
  clip: string;
  frames: number;
  checks: AuditCheck[];
  /** Number of failed checks — 0 means the clip is clean. */
  failed: number;
  /** Non-gating observations, e.g. enclosed bare-canvas pockets. */
  info: string[];
}

/** Audit one baked clip against its character. */
export function auditClip(spec: CharacterSpec, baked: BakedClip): AuditReport {
  const clip = spec.clips.get(baked.name);
  if (clip === undefined) {
    throw new Error(`audit: character has no clip '${baked.name}'`);
  }
  const src = clip.mirrorOf !== '' ? spec.clips.get(clip.mirrorOf)! : clip;
  const checks: AuditCheck[] = [];
  const add = (id: AuditCheckId, ok: boolean, pass: string, fail: string): void => {
    checks.push({ id, ok, text: ok ? pass : fail });
  };

  const frames = baked.frames;
  if (frames.length === 0) {
    const check: AuditCheck = { id: 'valid', ok: false, text: 'no frames baked' };
    return { clip: baked.name, frames: 0, checks: [check], failed: 1, info: [] };
  }
  const offSize = frames.filter((f) => f.w !== spec.canvasW || f.h !== spec.canvasH).length;
  if (offSize > 0) {
    const check: AuditCheck = {
      id: 'valid',
      ok: false,
      text: `${offSize} frame(s) are not the declared ${spec.canvasW}x${spec.canvasH} canvas`,
    };
    return { clip: baked.name, frames: frames.length, checks: [check], failed: 1, info: [] };
  }
  const vocab = vocabulary(spec);
  const ink = spec.grade.ink;
  const lone = spec.grade.emissiveLone;

  const cxs: number[] = [];
  let multi = 0;
  let edgeBad = 0;
  let speckles = 0;
  let offRamp = 0;
  let footSunk = 0;
  let grounded = 0;
  let flying = 0;
  const feetRows: number[] = [];
  const deltas: number[] = [];
  for (let f = 0; f < frames.length; f++) {
    const img = frames[f];
    const s = stats(img, ink);
    cxs.push(s.cx);
    if (s.islands !== 1) multi++;
    const e = edgeFill(img, ink);
    if (e.top + e.left + e.right > 0) edgeBad++;
    speckles += specklePx(img, ink, lone);
    offRamp += offVocabPx(img, vocab);
    feetRows.push(s.feet);
    const feetD = s.feet - spec.groundRow;
    if (feetD > 1) footSunk++;
    if (Math.abs(feetD) <= 1) grounded++;
    if (feetD < -1) flying++;
    if (f > 0) deltas.push(changed(img, frames[f - 1]));
  }

  if (frames.length > 1) {
    const minDelta = Math.min(...deltas);
    add(
      'distinct',
      minDelta > 0,
      `every frame differs from its predecessor (min ${minDelta} px)`,
      'a frame is identical to the one before it — a channel resolved to all zeros',
    );
    if (src.loop) {
      const wrap = changed(frames[0], frames[frames.length - 1]);
      const mean = deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length);
      add(
        'wrap',
        wrap <= Math.max(6, Math.round(mean * 2)),
        `loop wrap ${wrap} px within 2x of the mean inter-frame delta (${mean.toFixed(1)})`,
        `loop wrap ${wrap} px vs mean delta ${mean.toFixed(1)} — the cycle pops on repeat`,
      );
    }
  }
  add(
    'islands',
    multi === 0,
    'the silhouette is one connected mass in every frame',
    `${multi} frame(s) have a detached piece`,
  );
  const wobble = cxWobble(cxs);
  add(
    'in-place',
    wobble <= src.wobbleBudget,
    `centroid wobble ${wobble.toFixed(2)} px within budget ${src.wobbleBudget.toFixed(1)}`,
    `centroid wobbles ${wobble.toFixed(2)} px around the cycle mean (budget ${src.wobbleBudget.toFixed(1)}) — the cycle walks itself sideways`,
  );
  if (src.airborne) {
    // An airborne clip must not sink, must touch down at least once, and
    // must actually FLY at least once — otherwise the flag is a lie that
    // merely loosens the grounded rule.
    add(
      'baseline',
      footSunk === 0 && grounded > 0 && flying > 0,
      `airborne: no sink, ${grounded} frame(s) grounded, ${flying} frame(s) in flight`,
      footSunk > 0
        ? `${footSunk} frame(s) sink below the ground row (measured feet rows ${Math.min(...feetRows)}..${Math.max(...feetRows)}, ground row ${spec.groundRow})`
        : grounded === 0
          ? `no frame touches the ground — the clip floats (measured feet rows ${Math.min(...feetRows)}..${Math.max(...feetRows)}, ground row ${spec.groundRow})`
          : 'declared airborne but no frame ever leaves the ground',
    );
  } else {
    // The measured rows are in the failure text on purpose: "measure, never
    // eyeball" only works if the audit hands the measurement over.
    add(
      'baseline',
      footSunk === 0 && grounded === frames.length,
      'feet stay within 1 px of the ground row in every frame',
      `feet leave the ground row on ${Math.max(footSunk, frames.length - grounded)} frame(s): measured feet rows ${Math.min(...feetRows)}..${Math.max(...feetRows)}, declared ground row ${spec.groundRow}`,
    );
  }
  add(
    'edge',
    edgeBad === 0,
    'no fill pixel on the top/left/right canvas boundary',
    `fill on the canvas boundary in ${edgeBad} frame(s) — the shape reads as cropped`,
  );
  add(
    'speckle',
    speckles === 0,
    'no lone pixel survived the grade',
    `${speckles} lone pixel(s) survived the grade`,
  );
  add(
    'ramp',
    offRamp === 0,
    'every colour is in the declared vocabulary',
    `${offRamp} pixel(s) outside the declared vocabulary`,
  );

  const info: string[] = [];
  let pocketFrames = 0;
  let pocketMax = 0;
  for (const img of frames) {
    const p = pocketPx(img);
    if (p > 0) {
      pocketFrames++;
      pocketMax = Math.max(pocketMax, p);
    }
  }
  info.push(
    `enclosed bare-canvas pockets: ${pocketFrames} frame(s), largest ${pocketMax} px`,
  );

  return {
    clip: baked.name,
    frames: frames.length,
    checks,
    failed: checks.filter((c) => !c.ok).length,
    info,
  };
}

/** Bake and audit every clip. The character-level gate: all reports clean. */
export function auditCharacter(spec: CharacterSpec): AuditReport[] {
  const reports: AuditReport[] = [];
  for (const baked of bakeAllClips(spec).values()) {
    reports.push(auditClip(spec, baked));
  }
  return reports;
}

/** Render a report the way the Godot audit prints one — the compact form an
 * authoring transcript or a terminal wants. */
export function formatReport(report: AuditReport): string {
  const lines: string[] = [];
  if (report.failed === 0) {
    lines.push(`  ok    ${report.clip} (${report.frames} frames)`);
  } else {
    for (const c of report.checks) {
      if (!c.ok) lines.push(`  FAIL  ${report.clip}: ${c.id}: ${c.text}`);
    }
  }
  for (const i of report.info) lines.push(`  info  ${report.clip}: ${i}`);
  return lines.join('\n');
}
