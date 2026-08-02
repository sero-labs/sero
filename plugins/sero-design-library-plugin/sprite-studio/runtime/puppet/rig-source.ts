/**
 * Writing a rig out as a character file.
 *
 * The character contract does not change: a character is still TypeScript
 * source compiled at bake time, and the engine still knows nothing about where
 * the parts came from. What changes is who writes it. An LLM asked to describe
 * a knight in capsule coordinates produced a capsule man; the same knight's own
 * pixels, cut along a human's joints, are already the picture. So this emits
 * the file instead — and the model's job moves from DRAWING to ANIMATING, which
 * is the half a language model is actually suited to.
 *
 * Two things are worth knowing when reading the output.
 *
 * **Every piece is stamped through a paint bone.** `legNearUpper` carries the
 * true angle and length of the thigh, so IK and motion curves mean what they
 * say. `legNearUpper_art` is its child, resting at exactly minus its parent's
 * world angle, so its frame is square to the canvas and a stamp lands where the
 * pixels were cut from. Parts bind to the paint bone; clips key the real one.
 *
 * **The pixels are the palette, byte for byte.** A piece is one byte per cell
 * into the character's own palette (255 = nothing drawn), base64'd. Nothing is
 * resampled on the way in or out, so the rest frame is the reference again —
 * which is what the bind-pose gate measures.
 */

import type { Palette, Rgb } from '../../engine/types';
import { TRANSPARENT } from '../../engine/types';
import type { Rig, RigPiece } from './rig';
import { PAINT_SUFFIX, SS } from './rig';

/** Palette index meaning "nothing drawn here" in an encoded piece. */
const NOTHING = 255;

export interface RigSourceOptions {
  canvasW: number;
  canvasH: number;
  /** The lowest row the figure may occupy — the target's foot row plus the
   * outline the grade lays around it. */
  groundRow: number;
  /** Least share of the canvas height the figure spans; the fill gate's floor. */
  minFill: number;
  /** Where the reference came from, for the file's own header. */
  note?: string;
}

const hex2 = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
const toHex = (c: Rgb): string => hex2(c[0]) + hex2(c[1]) + hex2(c[2]);
const num = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(4));

/** Perceived lightness, only ever used to pick the darkest colour for ink. */
const luma = (c: Rgb): number => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

/** One byte per cell, base64. A palette is capped well under 255 entries, so
 * the sentinel cannot collide with a real index. */
function encodePiece(piece: RigPiece): string {
  const bytes = new Uint8Array(piece.w * piece.h);
  for (let i = 0; i < bytes.length; i++) {
    const cell = piece.cells[i];
    bytes[i] = cell === TRANSPARENT || cell < 0 || cell >= NOTHING ? NOTHING : cell;
  }
  return Buffer.from(bytes).toString('base64');
}

/** Break a long literal so the emitted file is still readable in a diff. */
function wrap(text: string, width = 108): string {
  const lines: string[] = [];
  for (let at = 0; at < text.length; at += width) lines.push(text.slice(at, at + width));
  return lines.map((line) => `'${line}'`).join(' +\n      ');
}

function emitSkeleton(rig: Rig): string {
  const lines: string[] = [
    `  const S = new Skeleton();`,
    `  S.rootPos = [${num(rig.rootPos[0])}, ${num(rig.rootPos[1])}];`,
  ];
  for (const bone of rig.bones) {
    lines.push(
      `  S.bone('${bone.name}', '${bone.parent}', [${num(bone.pivot[0])}, ${num(bone.pivot[1])}], ${num(bone.restDeg)}, ${num(bone.length)});`,
    );
  }
  lines.push('');
  lines.push(`  // Square to the canvas at rest: each cancels its parent's world angle, so a`);
  lines.push(`  // stamped piece lands exactly where it was cut and still swings with the bone.`);
  for (const bone of rig.bones) {
    lines.push(
      `  S.bone('${bone.name}${PAINT_SUFFIX}', '${bone.name}', [0, 0], ${num(-bone.worldDeg)}, 0);`,
    );
  }
  return lines.join('\n');
}

function emitParts(rig: Rig): string {
  const byName = new Map(rig.bones.map((bone) => [bone.name, bone]));
  const lines: string[] = ['  const parts: Part[] = ['];
  for (const piece of rig.pieces) {
    const bone = byName.get(piece.name);
    if (bone === undefined) continue;
    const atX = piece.x0 * SS - bone.origin[0] * SS;
    const atY = piece.y0 * SS - bone.origin[1] * SS;
    lines.push(`    {`);
    lines.push(`      name: '${piece.name}',`);
    lines.push(`      bone: '${piece.bone}',`);
    lines.push(`      ramp: ramp([${piece.ramp.join(', ')}]),`);
    lines.push(
      `      paint: stamp(${num(atX)}, ${num(atY)}, pixels(${piece.w}, ${piece.h},\n      ${wrap(encodePiece(piece))})),`,
    );
    lines.push(`    },`);
  }
  lines.push('  ];');
  return lines.join('\n');
}

/**
 * A breathing idle that leaves the feet alone.
 *
 * The spine is the root, so rotating it rotates the legs with it and the feet
 * leave the ground row — the baseline gate's whole job. Each thigh therefore
 * takes the spine's rotation back off again, which holds both feet still while
 * the chest still moves.
 */
function emitIdle(rig: Rig): string {
  const has = (name: string): boolean => rig.bones.some((bone) => bone.name === name);
  const trunk = rig.bones[0]?.name ?? '';
  const lines: string[] = [
    `  const idle = new Motion('idle', 2.4);`,
    `  idle.bakeFps = 10;`,
    `  idle.key('${trunk}', { 0: -1.4, 1.2: 1.4, 2.4: -1.4 });`,
  ];
  for (const thigh of ['legNearUpper', 'legFarUpper']) {
    if (has(thigh)) lines.push(`  idle.key('${thigh}', { 0: 1.4, 1.2: -1.4, 2.4: 1.4 });`);
  }
  if (has('head')) lines.push(`  idle.key('head', { 0: 1.2, 1.2: -1.2, 2.4: 1.2 });`);
  if (has('armNearUpper')) lines.push(`  idle.key('armNearUpper', { 0: -2.4, 1.2: 2.4, 2.4: -2.4 });`);
  if (has('armNearLower')) lines.push(`  idle.key('armNearLower', { 0: 1.6, 1.2: -1.6, 2.4: 1.6 });`);
  if (has('armFarUpper')) lines.push(`  idle.key('armFarUpper', { 0: 2, 1.2: -2, 2.4: 2 });`);
  return lines.join('\n');
}

/**
 * A walk driven by foot paths, which is the clip that actually tests the cut:
 * every joint in the rig swings through its whole range, so a piece cut onto
 * the wrong bone flies off where a still frame would never show it.
 */
function emitWalk(rig: Rig): string | null {
  const need = ['legNearUpper', 'legNearLower', 'footNear', 'legFarUpper', 'legFarLower', 'footFar'];
  if (!need.every((name) => rig.bones.some((bone) => bone.name === name))) return null;
  return [
    `  const walk = new Motion('walk', 0.8);`,
    `  walk.bakeFps = 15;`,
    `  walk.wobbleBudget = 3.5;`,
    `  walk.gait('legNearUpper', 'legNearLower', 'footNear', 26, 13, 0, GROUND_ROW * SS, -6);`,
    `  walk.gait('legFarUpper', 'legFarLower', 'footFar', 26, 13, 0.5, GROUND_ROW * SS, 6);`,
    `  walk.key('spine', { 0: -1.5, 0.4: 1.5, 0.8: -1.5 });`,
    `  walk.key('armNearUpper', { 0: 3, 0.4: -3, 0.8: 3 });`,
    `  walk.key('armFarUpper', { 0: -2, 0.4: 2, 0.8: -2 });`,
  ].join('\n');
}

/** The whole character file. */
export function rigSource(rig: Rig, palette: Palette, options: RigSourceOptions): string {
  const darkest = palette.reduce(
    (best, colour, index) => (luma(colour) < luma(palette[best]) ? index : best),
    0,
  );
  const walk = emitWalk(rig);
  return `/**
 * ${options.note ?? 'A character rigged from its own reference art.'}
 *
 * GENERATED by the rig builder — every piece here is the reference's own
 * pixels, cut along hand-placed joints and stamped onto a bone. Editing the
 * artwork means re-cutting; editing the ANIMATION means editing the clips at
 * the bottom, which is what this file is for.
 */
import type { CharacterSpec, Color, Part, Pose } from '@sero-ai/ink-and-bones';
import { Img, Motion, Paint, Skeleton, hex } from '@sero-ai/ink-and-bones';

const CANVAS_W = ${options.canvasW};
const CANVAS_H = ${options.canvasH};
const GROUND_ROW = ${options.groundRow};
const SS = ${SS};

/** The reference's own colours. Every piece indexes into this. */
const P: Color[] = [
  ${palette.map((c) => `'${toHex(c)}'`).join(', ')},
].map((c) => hex(c));

/** The darkest colour the picture already had, so the engine's silhouette ring
 * matches the outline the artwork was drawn with. */
const INK = P[${darkest}];

const ramp = (indexes: number[]): Color[] => indexes.map((i) => P[i]);

/** One byte per cell into P, ${NOTHING} where nothing is drawn. */
function pixels(w: number, h: number, data: string): Img {
  const bytes = atob(data);
  const img = new Img(w, h);
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes.charCodeAt(i);
    if (v !== ${NOTHING}) img.set(i % w, Math.floor(i / w), P[v]);
  }
  return img;
}

/** A piece on its bone's canvas, one source pixel per ${SS}x${SS} block. */
function stamp(atX: number, atY: number, img: Img): Paint {
  const paint = new Paint({ x: atX, y: atY, w: img.w * SS, h: img.h * SS });
  paint.image(img, [atX, atY], SS);
  return paint;
}

export function buildCharacter(): CharacterSpec {
${emitSkeleton(rig)}

${emitParts(rig)}

${emitIdle(rig)}
${walk === null ? '' : `\n${walk}\n`}
  const clips = new Map<string, Motion>();
  clips.set('idle', idle);${walk === null ? '' : `\n  clips.set('walk', walk);`}

  function restPose(): Pose {
    return { deg: {} };
  }

  return {
    canvasW: CANVAS_W,
    canvasH: CANVAS_H,
    groundRow: GROUND_ROW,
    minFill: ${options.minFill},
    skeleton: S,
    parts,
    clips,
    grade: { ink: INK, shadow: INK, emissiveLone: [] },
    restPose,
  };
}
`;
}
