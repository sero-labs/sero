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
import { PAINT_SUFFIX } from './rig';

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
  /**
   * How many px the compositor works in per finished pixel.
   *
   * It is the target's cells per 1x pixel TIMES the supersampled px per cell:
   * a sprite-resolution target cut at 4 makes 4, and a target already stood on
   * an 8x working canvas makes 8. Passed rather than derived so the character
   * and the cut cannot disagree about it.
   */
  superSample: number;
  /** Where the reference came from, for the file's own header. */
  note?: string;
  /** The pieces are already finished pixels: sample them at the nearest one and
   * keep the colour a cell mostly is. Right for a pixel-art reference, wrong
   * for a painted one, where averaging real detail is the point. */
  crisp?: boolean;
  /** Cluster stray pixels, and ring the silhouette in ink. Both belong OFF for
   * a target that is already finished pixel art and ON for one cut from a
   * high-resolution drawing, where the grade is what makes the pixels. */
  despeckle?: boolean;
  outline?: boolean;
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

function emitParts(rig: Rig, crisp: boolean): string {
  const byName = new Map(rig.bones.map((bone) => [bone.name, bone]));
  const lines: string[] = ['  const parts: Part[] = ['];
  for (const piece of rig.pieces) {
    const bone = byName.get(piece.name);
    if (bone === undefined) continue;
    const atX = (piece.x0 - bone.origin[0]) * rig.unit;
    const atY = (piece.y0 - bone.origin[1]) * rig.unit;
    lines.push(`    {`);
    lines.push(`      name: '${piece.name}',`);
    lines.push(`      bone: '${piece.bone}',`);
    lines.push(`      ramp: ramp([${piece.ramp.join(', ')}]),`);
    if (crisp) lines.push(`      crisp: true,`);
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
const CYCLE = 0.8;


/**
 * A walk, as two authored foot paths.
 *
 * Not `Motion.gait`, for one reason that matters: a gait aims the end bone at
 * `90 + toe`, which assumes the foot bone points EAST. A rig's foot bone points
 * wherever the human put the toe joint, and on the first knight the two feet
 * disagreed by seventy degrees — so the gait wrenched the near foot round
 * almost a right angle and it read as a broken ankle. Each foot here is held at
 * the angle it was DRAWN at, with a few degrees of roll.
 *
 * The stride is measured off the leg rather than picked. The first attempt used
 * the spike's number against a figure four times the size, and the legs
 * shuffled.
 */
function emitWalk(rig: Rig): string | null {
  const need = ['legNearUpper', 'legNearLower', 'footNear', 'legFarUpper', 'legFarLower', 'footFar'];
  if (!need.every((name) => rig.bones.some((bone) => bone.name === name))) return null;
  const by = new Map(rig.bones.map((bone) => [bone.name, bone]));
  const unit = rig.unit;
  const lines: string[] = [
    `  const walk = new Motion('walk', ${CYCLE});`,
    `  walk.bakeFps = 15;`,
    `  walk.wobbleBudget = 4.5;`,
  ];
  // A three-quarter reference gives a rig whose two feet stand a long way
  // apart sideways — the knight's are 26 px apart on a 112 px canvas. Left in
  // their own lanes the legs slide back and forth past each other without ever
  // meeting, which reads as a shuffle however long the stride is. The lanes are
  // therefore drawn part of the way toward each other, so the legs pass close
  // and the step reads, without pulling the far leg so far off its own hip that
  // it leans.
  const near = by.get('legNearLower')!.tip;
  const far = by.get('legFarLower')!.tip;
  const middle = ((near[0] + far[0]) / 2) * unit;
  const CLOSE = 0.6;
  for (const side of ['Near', 'Far'] as const) {
    const upper = by.get(`leg${side}Upper`)!;
    const lower = by.get(`leg${side}Lower`)!;
    const foot = by.get(`foot${side}`)!;
    const ax = lower.tip[0] * unit + (middle - lower.tip[0] * unit) * CLOSE;
    // Each foot keeps its OWN ground height: the near boot was drawn lower than
    // the far one, and levelling them would lift one off the floor.
    const ay = lower.tip[1] * unit;
    const reach = upper.length + lower.length;
    const stride = reach * 0.44;
    // Mid-swing puts the ankle under its own hip and well up, which is what
    // folds the knee. A foot that only slides forward keeps a straight leg, and
    // a straight leg is the shuffle.
    const hipX = upper.origin[0] * unit;
    const lift = reach * 0.2;
    const deg = foot.worldDeg;
    const at = (fraction: number): string => num(((fraction + (side === 'Far' ? 0.5 : 0)) % 1) * CYCLE);
    const step = (x: number, y: number, roll: number): string =>
      `[${num(x)}, ${num(ay + y)}, ${num(deg + roll)}]`;
    lines.push(
      `  walk.plant('leg${side}Upper', 'leg${side}Lower', 'foot${side}', {`,
      // Contact: the foot is still and the body travels over it, which in an
      // in-place clip means a straight slide backwards at a constant rate.
      `    ${at(0)}: ${step(ax + stride / 2, 0, -8)},`,
      `    ${at(0.25)}: ${step(ax, 0, 0)},`,
      `    ${at(0.5)}: ${step(ax - stride / 2, 0, 12)},`,
      // Swing: fold up under the hip, then reach out to the next heel strike.
      `    ${at(0.66)}: ${step(hipX, -lift, 6)},`,
      `    ${at(0.83)}: ${step(ax + stride / 2.6, -lift * 0.35, -6)},`,
      `  }, 'linear');`,
    );
  }
  lines.push(
    // The body drops as a foot takes the weight and rises as it passes over —
    // twice a cycle, and it is most of what makes a walk feel like weight.
    `  walk.key('root_y', { 0: 5, ${num(CYCLE / 4)}: -2, ${num(CYCLE / 2)}: 5, ${num((CYCLE * 3) / 4)}: -2 });`,
    `  walk.key('spine', { 0: -2.5, ${num(CYCLE / 2)}: 2.5 });`,
    `  walk.key('head', { 0: 2, ${num(CYCLE / 2)}: -2 });`,
    `  walk.key('armNearUpper', { 0: 3, ${num(CYCLE / 2)}: -3 });`,
    `  walk.key('armFarUpper', { 0: -2.5, ${num(CYCLE / 2)}: 2.5 });`,
  );
  return lines.join('\n');
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
const SUPER = ${options.superSample};
const SS = ${rig.unit};

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

/** A piece on its bone's canvas, one source cell per ${rig.unit}x${rig.unit} block. */
function stamp(atX: number, atY: number, img: Img): Paint {
  const paint = new Paint({ x: atX, y: atY, w: img.w * SS, h: img.h * SS });
  paint.image(img, [atX, atY], SS);
  return paint;
}

export function buildCharacter(): CharacterSpec {
${emitSkeleton(rig)}

${emitParts(rig, options.crisp === true)}

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
    // The pixels are already art. Averaging them, clustering their deliberate
    // single pixels away, or ringing artwork that has its own outline in a
    // second one all destroy the thing being copied.
    superSample: SUPER,
    grade: {
      ink: INK,
      shadow: INK,
      emissiveLone: [],
      despeckle: ${options.despeckle ?? false},
      outline: ${options.outline ?? false},
    },
    restPose,
  };
}
`;
}
