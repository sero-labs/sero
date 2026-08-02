/**
 * The character contract — the shape every authored character file exports.
 *
 * A character is TypeScript source written against this package's API. Its
 * module exports a build function returning a `CharacterSpec`; everything the
 * engine does (bake, audit, review, play) starts from this one object. The
 * engine knows nothing about who authored it or where it is stored.
 */

import { bake, renderRest } from './compositor';
import type { GradeConfig, Part, Shadow } from './compositor';
import type { Color } from './img';
import { Img } from './img';
import type { Motion } from './motion';
import type { Pose, Skeleton } from './skeleton';

export interface CharacterSpec {
  /** 1x canvas size in pixels. */
  canvasW: number;
  canvasH: number;
  /** The feet baseline: the lowest opaque row (outline included) of the rest
   * frame. The audit's ground truth for "standing on the ground". */
  groundRow: number;
  skeleton: Skeleton;
  parts: readonly Part[];
  clips: ReadonlyMap<string, Motion>;
  grade: GradeConfig;
  shadow?: Shadow;
  /** The standing pose the rest frame renders — usually a couple of IK
   * solves, so legs land exactly on the plant line. */
  restPose(): Pose;
}

/** A baked clip, mirrors already resolved to flipped frames. */
export interface BakedClip {
  name: string;
  frames: Img[];
  fps: number;
  loop: boolean;
}

/** Stable string key for an exact frame colour, e.g. "4e5f78" — the unit the
 * vocabulary and the graded-pixel checks compare in. */
export function colorKey(c: Color): string {
  const b = (v: number): string => Math.round(v * 255).toString(16).padStart(2, '0');
  return b(c[0]) + b(c[1]) + b(c[2]);
}

/** Every colour the character is allowed to emit: the union of the part
 * ramps, the ink, and the emissive accents. Derived, never declared — the
 * paints cannot drift from the law they are audited against. */
export function vocabulary(spec: CharacterSpec): Set<string> {
  const vocab = new Set<string>();
  vocab.add(colorKey(spec.grade.ink));
  for (const c of spec.grade.emissiveLone) vocab.add(colorKey(c));
  for (const part of spec.parts) {
    for (const c of part.ramp) vocab.add(colorKey(c));
  }
  return vocab;
}

/** Bake one clip. A mirror clip bakes its source and flips every frame. */
export function bakeClip(spec: CharacterSpec, name: string): BakedClip {
  const clip = spec.clips.get(name);
  if (clip === undefined) {
    throw new Error(`bake: character has no clip '${name}'`);
  }
  if (clip.mirrorOf !== '') {
    const src = bakeClip(spec, clip.mirrorOf);
    return {
      name,
      frames: src.frames.map((f) => f.flippedX()),
      fps: clip.bakeFps,
      loop: clip.loop,
    };
  }
  const frames = bake(
    spec.skeleton,
    spec.parts,
    clip,
    spec.canvasW,
    spec.canvasH,
    spec.grade,
    spec.shadow,
  );
  return { name, frames, fps: clip.bakeFps, loop: clip.loop };
}

/** Bake every clip the character declares. */
export function bakeAllClips(spec: CharacterSpec): Map<string, BakedClip> {
  const out = new Map<string, BakedClip>();
  for (const name of spec.clips.keys()) out.set(name, bakeClip(spec, name));
  return out;
}

/** The rest frame: skeleton held at restPose, chains settled in still air. */
export function bakeRest(spec: CharacterSpec): Img {
  return renderRest(
    spec.skeleton,
    spec.parts,
    spec.restPose(),
    spec.canvasW,
    spec.canvasH,
    spec.grade,
    spec.shadow,
  );
}
