/**
 * Ink & Bones — the verlet cloth simulation (scarves, ribbons, hair).
 * Ported from the chain half of art/compositor.gd.
 *
 * Chains integrate at a fixed 60 Hz regardless of bakeFps — pure float math,
 * no randomness, so a bake is bit-identical on every run. Looping clips get
 * warm-up cycles first, so frame 0 already sits on the cloth's steady state
 * and the loop wraps honestly.
 */

import type { Motion } from './motion';
import type { ChainDef, Pose, Skeleton } from './skeleton';
import type { Affine, Vec } from './vec';
import { apply, basisXform, fposmod, normalize } from './vec';

/** The chain integrator's fixed rate. Also the ceiling on a clip's bakeFps:
 * above it, bake frames would share simulation steps and chain samples would
 * silently vanish — bakeClip enforces the bound. */
export const SIM_FPS = 60;
/** Warm-up cycles before recording, so a loop's chain state is periodic. */
const WARM_CYCLES = 16;

interface ChainState {
  p: Vec[];
  prev: Vec[];
}

/** Simulate every chain through the clip: warm-up first, then one recorded
 * pass. Returns chain name -> per-bake-frame link positions. */
export function simulateChains(
  skel: Skeleton,
  clip: Motion,
  nFrames: number,
): Map<string, Vec[][]> {
  const defs = skel.chains;
  const out = new Map<string, Vec[][]>();
  if (defs.size === 0) return out;
  const dt = 1 / SIM_FPS;
  const warm = clip.loop ? WARM_CYCLES * clip.cycle : 1.5;
  const totalSteps = Math.round((warm + clip.cycle) * SIM_FPS);

  const clipTime = (t: number): number =>
    clip.loop ? fposmod(t, clip.cycle) : Math.min(Math.max(t, 0), clip.cycle);

  const state = new Map<string, ChainState>();
  for (const [name, def] of defs) {
    state.set(name, chainInit(skel, def, clip.poseAt(clipTime(-warm), skel)));
    out.set(name, new Array<Vec[]>(nFrames));
  }
  const recordSteps = new Map<number, number>();
  for (let f = 0; f < nFrames; f++) {
    recordSteps.set(Math.round((warm + f / clip.bakeFps) * SIM_FPS), f);
  }

  for (let step = 0; step <= totalSteps; step++) {
    const t = step * dt - warm;
    const pose = clip.poseAt(clipTime(t), skel);
    const xfs = skel.transforms(pose);
    for (const [name, def] of defs) {
      const boneXf = xfs.get(def.bone)!;
      const anchor = apply(boneXf, def.anchor);
      chainStep(state.get(name)!, anchor, def, clip.windAt(clipTime(t)), dt, rootDir(boneXf, def));
    }
    const f = recordSteps.get(step);
    if (f !== undefined) {
      for (const name of defs.keys()) {
        out.get(name)![f] = state.get(name)!.p.map((p): Vec => [p[0], p[1]]);
      }
    }
  }
  return out;
}

/** Chains hanging in still air with the skeleton held at `pose`. */
export function settleChains(skel: Skeleton, pose: Pose): Map<string, Vec[]> {
  const out = new Map<string, Vec[]>();
  if (skel.chains.size === 0) return out;
  const dt = 1 / SIM_FPS;
  const xfs = skel.transforms(pose);
  for (const [name, def] of skel.chains) {
    const st = chainInit(skel, def, pose);
    const boneXf = xfs.get(def.bone)!;
    const anchor = apply(boneXf, def.anchor);
    for (let step = 0; step < 4 * SIM_FPS; step++) {
      chainStep(st, anchor, def, [0, 0], dt, rootDir(boneXf, def));
    }
    out.set(name, st.p);
  }
  return out;
}

/** The chain's rest hang direction carried into world space by its bone. */
function rootDir(boneXf: Affine, def: ChainDef): Vec {
  const d = basisXform(boneXf, def.restDir);
  return d[0] * d[0] + d[1] * d[1] > 0.0001 ? normalize(d) : [0, 1];
}

function chainInit(skel: Skeleton, def: ChainDef, pose: Pose): ChainState {
  const xfs = skel.transforms(pose);
  const anchor = apply(xfs.get(def.bone)!, def.anchor);
  const p: Vec[] = [];
  const prev: Vec[] = [];
  for (let i = 0; i <= def.links; i++) {
    const pt: Vec = [anchor[0], anchor[1] + i * def.len];
    p.push(pt);
    prev.push(pt);
  }
  return { p, prev };
}

function chainStep(
  st: ChainState,
  anchor: Vec,
  def: ChainDef,
  clipWind: Vec,
  dt: number,
  restDir: Vec,
): void {
  const { p, prev } = st;
  const links = p.length - 1;
  // Integrate. The wind is TAPERED along the chain: a uniform field on rigid
  // links has one equilibrium — a straight plank. Shielding the collar links
  // is what lets the cloth settle into a C.
  for (let i = 1; i < p.length; i++) {
    const f = def.windTaper + (1 - def.windTaper) * (i / links);
    const ax = (def.wind[0] + clipWind[0]) * f;
    const ay = def.gravity + (def.wind[1] + clipWind[1]) * f;
    const cur = p[i];
    p[i] = [
      cur[0] + (cur[0] - prev[i][0]) * def.damp + ax * dt * dt,
      cur[1] + (cur[1] - prev[i][1]) * def.damp + ay * dt * dt,
    ];
    prev[i] = cur;
  }
  p[0] = anchor;
  prev[0] = anchor;
  // 6 relaxation passes — a dash's wind stretches links visibly at 4.
  for (let iter = 0; iter < 6; iter++) {
    p[0] = anchor;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i];
      const b = p[i + 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const d = Math.hypot(dx, dy);
      if (d < 0.0001) continue;
      const diff = (d - def.len) / d;
      if (i === 0) {
        p[i + 1] = [b[0] - dx * diff, b[1] - dy * diff];
      } else {
        p[i] = [a[0] + dx * diff * 0.5, a[1] + dy * diff * 0.5];
        p[i + 1] = [b[0] - dx * diff * 0.5, b[1] - dy * diff * 0.5];
      }
    }
    // BENDING: each link is drawn back toward continuing its predecessor's
    // direction, hardest at the collar — a C at rest, an S under acceleration.
    if (def.stiffness > 0) {
      for (let i = 0; i < p.length - 1; i++) {
        const lead: Vec =
          i === 0 ? restDir : normalize([p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]]);
        const k = def.stiffness * Math.pow(1 - i / links, 2);
        const tx = p[i][0] + lead[0] * def.len;
        const ty = p[i][1] + lead[1] * def.len;
        p[i + 1] = [p[i + 1][0] + (tx - p[i + 1][0]) * k, p[i + 1][1] + (ty - p[i + 1][1]) * k];
      }
    }
  }
}
