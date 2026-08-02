/**
 * Ink & Bones — a clip as EASED CURVES over a skeleton, not a frame table.
 * Direct port of art/motion.gd.
 *
 * Channels key bone rotations (degrees) or the root offset at times in
 * seconds; feet are driven by authored FOOT PATHS whose hip/knee angles fall
 * out of 2-bone IK. Frame counts are a SAMPLING decision (bakeFps), made at
 * bake time.
 */

import type { Skeleton, Pose } from './skeleton';
import type { Vec } from './vec';
import { clamp, fposmod, lerp, smoothstep } from './vec';

export type Ease = 'linear' | 'sine' | 'step' | 'outBack';

interface Channel {
  times: number[];
  values: number[];
  ease: Ease;
}

interface Gait {
  upper: string;
  lower: string;
  end: string;
  stride: number;
  lift: number;
  phase: number;
  hipX: number;
  groundY: number;
  contact: number;
}

interface Plant {
  upper: string;
  lower: string;
  end: string;
  bend: number;
}

/** Default portion of the gait cycle a foot spends on the ground — a walk. */
const CONTACT = 0.6;

export class Motion {
  readonly name: string;
  /** Cycle length in seconds. */
  readonly cycle: number;
  readonly loop: boolean;
  /** Loops read best at 12-15 fps; actions on twos at 24 with holds. */
  bakeFps = 15;
  airborne = false;
  /** In-place tolerance: how far (1x px) the silhouette's centroid-x may
   * stray from the clip's own mean before the audit calls it a sideways
   * walk. A deliberate lunge declares a bigger budget. */
  wobbleBudget = 2.5;
  /** Extra wind this clip adds to every verlet chain (ss px/s^2). */
  wind: Vec = [0, 0];
  /** Set on a mirror clip: the east clip whose frames this one flips. */
  mirrorOf = '';

  private channels = new Map<string, Channel>();
  private gaits: Gait[] = [];
  private plants: Plant[] = [];

  constructor(name: string, cycleSeconds: number, looping = true) {
    this.name = name;
    this.cycle = cycleSeconds;
    this.loop = looping;
  }

  /** Key one channel: a bone name (delta deg) or "root_x" / "root_y" (ss px). */
  key(channel: string, keys: Record<number, number>, ease: Ease = 'sine'): void {
    const times = Object.keys(keys)
      .map(Number)
      .sort((a, b) => a - b);
    this.channels.set(channel, { times, values: times.map((t) => keys[t]), ease });
  }

  /**
   * Author a foot path; IK does the rest. `contact` is the fraction of the
   * cycle the foot is DOWN — it alone decides whether the clip can fly.
   */
  gait(
    upper: string,
    lower: string,
    end: string,
    stride: number,
    lift: number,
    phase: number,
    groundY: number,
    hipX = 0,
    contact = CONTACT,
  ): void {
    this.gaits.push({
      upper,
      lower,
      end,
      stride,
      lift,
      phase,
      hipX,
      groundY,
      contact: clamp(contact, 0.05, 0.95),
    });
  }

  /** Per-clip draw-order override; stepped — depth changes are cuts. */
  layer(part: string, keys: Record<number, number>, ease: Ease = 'step'): void {
    this.key('z:' + part, keys, ease);
  }

  zOffsets(t: number): Map<string, number> {
    const out = new Map<string, number>();
    const u = this.loop ? fposmod(t / this.cycle, 1) : clamp(t / this.cycle, 0, 1);
    for (const name of this.channels.keys()) {
      if (name.startsWith('z:')) out.set(name.slice(2), this.value(name, u));
    }
    return out;
  }

  /**
   * KEYED IK targets for a limb chain — the action-clip tool. `keys` maps
   * seconds to [x, y, endWorldDeg] in ss canvas coordinates.
   */
  plant(
    upper: string,
    lower: string,
    end: string,
    keys: Record<number, [number, number, number]>,
    ease: Ease = 'sine',
    bend = 1,
  ): void {
    const kx: Record<number, number> = {};
    const ky: Record<number, number> = {};
    const kd: Record<number, number> = {};
    for (const [t, v] of Object.entries(keys)) {
      kx[Number(t)] = v[0];
      ky[Number(t)] = v[1];
      kd[Number(t)] = v[2];
    }
    this.key('plant_x:' + end, kx, ease);
    this.key('plant_y:' + end, ky, ease);
    this.key('plant_d:' + end, kd, ease);
    this.plants.push({ upper, lower, end, bend });
  }

  /** A west-facing clip: the whole-frame mirror of `srcName`, flipped at bake. */
  static mirror(mirrorName: string, srcName: string, template: Motion): Motion {
    const m = new Motion(mirrorName, template.cycle, template.loop);
    m.bakeFps = template.bakeFps;
    m.airborne = template.airborne;
    m.wobbleBudget = template.wobbleBudget;
    m.mirrorOf = srcName;
    return m;
  }

  /** The wind driving the chains at `t` — keyable per axis via wind_x/wind_y. */
  windAt(t: number): Vec {
    const u = this.loop ? fposmod(t / this.cycle, 1) : clamp(t / this.cycle, 0, 1);
    return [
      this.channels.has('wind_x') ? this.value('wind_x', u) : this.wind[0],
      this.channels.has('wind_y') ? this.value('wind_y', u) : this.wind[1],
    ];
  }

  /** The full pose at `t` seconds, with every gait and plant solved. */
  poseAt(t: number, skel: Skeleton): Pose {
    const pose: Pose = { deg: {} };
    const u = this.loop ? fposmod(t / this.cycle, 1) : clamp(t / this.cycle, 0, 1);
    let rootX = 0;
    let rootY = 0;
    let hasRoot = false;
    for (const name of this.channels.keys()) {
      if (name.startsWith('z:') || name.startsWith('plant_') || name.startsWith('wind_')) {
        continue;
      }
      const v = this.value(name, u);
      if (name === 'root_x') {
        rootX = v;
        hasRoot = true;
      } else if (name === 'root_y') {
        rootY = v;
        hasRoot = true;
      } else {
        pose.deg[name] = v;
      }
    }
    if (hasRoot) pose.root = [rootX, rootY];
    for (const g of this.gaits) this.solveGait(pose, g, u, skel);
    for (const pl of this.plants) {
      const target: Vec = [
        this.value('plant_x:' + pl.end, u),
        this.value('plant_y:' + pl.end, u),
      ];
      skel.solveChain(
        pose,
        pl.upper,
        pl.lower,
        target,
        pl.bend,
        pl.end,
        this.value('plant_d:' + pl.end, u),
      );
    }
    return pose;
  }

  private solveGait(pose: Pose, g: Gait, u: number, skel: Skeleton): void {
    const gu = fposmod(u + g.phase, 1);
    let x = 0;
    let y = g.groundY;
    let toe = 0;
    if (gu < g.contact) {
      // PLANTED: touch down on the ball, roll flat, drive over the toe; the
      // ankle rises through heel-off so the pelvis can climb without the IK
      // over-reaching the leg.
      const s = gu / g.contact;
      x = lerp(g.stride * 0.5, -g.stride * 0.5, s);
      y -= g.lift * 0.35 * smoothstep(0.7, 1.0, s);
      toe = lerp(-4, -26, s);
    } else {
      // SWING: leaves hard plantarflexed, relaxes toward level as it reaches —
      // a foot that dorsiflexes in the air reads as a power-walk.
      const v = (gu - g.contact) / (1 - g.contact);
      x = lerp(-g.stride * 0.5, g.stride * 0.5, smoothstep(0, 1, v));
      y -= g.lift * Math.max(Math.sin(Math.PI * v), 0.35 * (1 - v));
      toe = -30 * (1 - v) * (1 - v) - 4 * v * v;
    }
    const target: Vec = [skel.rootPos[0] + g.hipX + x, y];
    skel.solveChain(pose, g.upper, g.lower, target, 1, g.end, 90 + toe);
  }

  private value(channel: string, u: number): number {
    const ch = this.channels.get(channel)!;
    const { times, values } = ch;
    if (times.length === 1) return values[0];
    const t = u * this.cycle;
    let i = times.length - 1;
    while (i >= 0 && times[i] > t) i--;
    let t0: number;
    let v0: number;
    let t1: number;
    let v1: number;
    if (i < 0) {
      if (!this.loop) return values[0];
      t0 = times[times.length - 1] - this.cycle;
      v0 = values[values.length - 1];
      t1 = times[0];
      v1 = values[0];
    } else if (i === times.length - 1) {
      if (!this.loop) return values[i];
      t0 = times[i];
      v0 = values[i];
      t1 = times[0] + this.cycle;
      v1 = values[0];
    } else {
      t0 = times[i];
      v0 = values[i];
      t1 = times[i + 1];
      v1 = values[i + 1];
    }
    const f = t1 === t0 ? 0 : clamp((t - t0) / (t1 - t0), 0, 1);
    return lerp(v0, v1, ease(f, ch.ease));
  }
}

function ease(f: number, kind: Ease): number {
  switch (kind) {
    case 'sine':
      return smoothstep(0, 1, f);
    case 'step':
      return f < 1 ? 0 : 1;
    case 'outBack': {
      const s = 1.70158;
      const g = f - 1;
      return g * g * ((s + 1) * g + s) + 1;
    }
    default:
      return f;
  }
}
