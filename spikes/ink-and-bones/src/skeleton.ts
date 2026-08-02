/**
 * Ink & Bones — the bone hierarchy behind a puppet. Direct port of
 * art/skeleton.gd: FK transforms, 2-bone IK, verlet chain declarations.
 *
 * All coordinates are SUPERSAMPLED px (4x the 1x canvas). A bone's local
 * frame has its origin at the joint and +Y along the bone; with every angle
 * at 0, +Y is screen-down. Angles are degrees; positive swings the tip EAST.
 * A pose maps bone name -> delta degrees, plus a root offset.
 */

import type { Affine, Vec } from './vec';
import {
  apply,
  clamp,
  degToRad,
  fromRot,
  mul,
  radToDeg,
  sub,
  unit,
} from './vec';

export interface Pose {
  deg: Record<string, number>;
  root?: Vec;
}

interface Bone {
  parent: string;
  pivot: Vec;
  rest: number;
  length: number;
}

export interface ChainDef {
  bone: string;
  anchor: Vec;
  links: number;
  len: number;
  wind: Vec;
  gravity: number;
  damp: number;
  windTaper: number;
  stiffness: number;
  restDir: Vec;
}

export class Skeleton {
  private bones = new Map<string, Bone>();
  private order: string[] = [];
  private last = '';
  readonly chains = new Map<string, ChainDef>();
  rootPos: Vec = [0, 0];

  bone(name: string, parent: string, pivot: Vec, restDeg: number, length = 0): void {
    if (parent !== '' && !this.bones.has(parent)) {
      throw new Error(`skeleton: bone '${name}' declares unknown parent '${parent}'`);
    }
    this.bones.set(name, { parent, pivot, rest: restDeg, length });
    this.order.push(name);
    this.last = name;
  }

  /** The tip of the most recently declared bone — the natural child pivot. */
  tip(): Vec {
    return this.last === '' ? [0, 0] : [0, this.bones.get(this.last)!.length];
  }

  chain(
    name: string,
    bone: string,
    anchor: Vec,
    links: number,
    linkLen: number,
    wind: Vec = [0, 0],
    gravity = 500,
    damp = 0.92,
    windTaper = 0,
    stiffness = 0,
    restDir: Vec = [0, 1],
  ): void {
    if (!this.bones.has(bone)) {
      throw new Error(`skeleton: chain '${name}' anchors to unknown bone '${bone}'`);
    }
    this.chains.set(name, {
      bone,
      anchor,
      links,
      len: linkLen,
      wind,
      gravity,
      damp,
      windTaper,
      stiffness,
      restDir,
    });
  }

  hasBone(name: string): boolean {
    return this.bones.has(name);
  }

  names(): readonly string[] {
    return this.order;
  }

  lengthOf(name: string): number {
    return this.bones.get(name)!.length;
  }

  /** World api angle (degrees, positive = east) of `name` under `pose`. */
  worldDeg(name: string, pose: Pose): number {
    let total = 0;
    let n = name;
    while (n !== '') {
      const b = this.bones.get(n)!;
      total += b.rest + (pose.deg[n] ?? 0);
      n = b.parent;
    }
    return total;
  }

  /** World transform of every bone: bone-local paint space -> ss canvas. */
  transforms(pose: Pose): Map<string, Affine> {
    const out = new Map<string, Affine>();
    const root = pose.root ?? [0, 0];
    for (const n of this.order) {
      const b = this.bones.get(n)!;
      const localDeg = b.rest + (pose.deg[n] ?? 0);
      const xf = fromRot(localDeg, b.pivot);
      if (b.parent === '') {
        const base: Affine = {
          a: 1,
          b: 0,
          c: 0,
          d: 1,
          tx: this.rootPos[0] + root[0],
          ty: this.rootPos[1] + root[1],
        };
        out.set(n, mul(base, xf));
      } else {
        out.set(n, mul(out.get(b.parent)!, xf));
      }
    }
    return out;
  }

  /**
   * 2-bone IK: rotate upper/lower so the lower's tip reaches `target` (world
   * ss px), writing deltas into `pose`. `bend` +1 bends the joint EAST (a
   * knee), -1 west (an elbow). Optionally aims an end bone at a world angle.
   */
  solveChain(
    pose: Pose,
    upper: string,
    lower: string,
    target: Vec,
    bend = 1,
    endBone = '',
    endWorldDeg = 0,
  ): void {
    const xfs = this.transforms(pose);
    const up = xfs.get(upper)!;
    const hip: Vec = [up.tx, up.ty];
    const l1 = this.lengthOf(upper);
    const l2 = this.lengthOf(lower);
    const d = sub(target, hip);
    const distTo = clamp(Math.hypot(d[0], d[1]), Math.abs(l1 - l2) + 0.5, l1 + l2 - 0.5);
    const base = radToDeg(Math.atan2(d[0], d[1]));
    const a1 = radToDeg(
      Math.acos(clamp((l1 * l1 + distTo * distTo - l2 * l2) / (2 * l1 * distTo), -1, 1)),
    );
    const upperWorld = base + bend * a1;
    const knee: Vec = [
      hip[0] + l1 * unit(upperWorld)[0],
      hip[1] + l1 * unit(upperWorld)[1],
    ];
    const reach: Vec = [hip[0] + distTo * unit(base)[0], hip[1] + distTo * unit(base)[1]];
    const lowerWorld = radToDeg(Math.atan2(reach[0] - knee[0], reach[1] - knee[1]));

    const upperBone = this.bones.get(upper)!;
    const upperParentWorld =
      this.worldDeg(upper, pose) - (upperBone.rest + (pose.deg[upper] ?? 0));
    pose.deg[upper] = upperWorld - upperParentWorld - upperBone.rest;
    pose.deg[lower] = lowerWorld - upperWorld - this.bones.get(lower)!.rest;
    if (endBone !== '') {
      pose.deg[endBone] = endWorldDeg - lowerWorld - this.bones.get(endBone)!.rest;
    }
  }
}

/** Convert a WORLD direction into `bone`'s local frame at a given pose. */
export function worldDirToLocal(skel: Skeleton, pose: Pose, bone: string, dir: Vec): Vec {
  const deg = skel.worldDeg(bone, pose);
  // local +Y maps to unit(deg); rotate the world dir back by the bone's angle
  const r = degToRad(deg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  // inverse of the (negated-angle) rotation used by transforms()
  return [cos * dir[0] - sin * dir[1], sin * dir[0] + cos * dir[1]];
}

export { apply };
