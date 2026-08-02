/**
 * "Vanguard", a plate-armoured knight with a long sword.
 *
 * The sword is a rigid child bone of the near hand. Its large, straight
 * silhouette stays clear of the body at rest, then the slash clip drives the
 * shoulder, elbow and blade as one articulated weapon arm.
 *
 * Canvas 64 x 80 at 1x; skeleton and paint coordinates are supersampled px
 * (4x). The ankles plant at y = 288 ss.
 */

import type { CharacterSpec, Color, Part, Pose } from '../src/index';
import { Motion, Paint, Skeleton, hex } from '../src/index';

export const CANVAS_W = 64;
export const CANVAS_H = 80;
const GROUND_Y = 288;
const GROUND_ROW = 74;

// --- palette ---------------------------------------------------------------

export interface Livery {
  steelLight: Color;
  steel: Color;
  steelDark: Color;
  clothLight: Color;
  cloth: Color;
  clothDark: Color;
}

export const CRIMSON: Livery = {
  steelLight: hex('d8dbe2'),
  steel: hex('9298a6'),
  steelDark: hex('505666'),
  clothLight: hex('ed6a62'),
  cloth: hex('b93644'),
  clothDark: hex('6f2433'),
};

export const AZURE: Livery = {
  steelLight: hex('e0e4df'),
  steel: hex('99a6a1'),
  steelDark: hex('53615f'),
  clothLight: hex('71b9e8'),
  cloth: hex('397fb7'),
  clothDark: hex('234b78'),
};

const INK = hex('171522');
const MAIL_LIGHT = hex('aab0bc');
const MAIL = hex('737b8a');
const MAIL_DARK = hex('414754');
const LEATHER = hex('684735');
const LEATHER_DARK = hex('412d27');
const BLADE_GLEAM = hex('f4f1d7');
const SHADOW: Color = [0.03, 0.02, 0.08, 0.45];

// --- dials -----------------------------------------------------------------

export interface Dials {
  /** Walk stride, ss px. */
  stride: number;
  /** Angle covered by the sword in the slash, degrees. */
  swordArc: number;
}

export const DEFAULT_DIALS: Dials = { stride: 52, swordArc: 105 };

// --- puppet ----------------------------------------------------------------

export function buildCharacter(
  livery: Livery = CRIMSON,
  dials: Dials = DEFAULT_DIALS,
): CharacterSpec {
  const S = new Skeleton();
  // The root is left of centre to reserve a clear column for the sword.
  S.rootPos = [96, 196];
  S.bone('pelvis', '', [0, 0], 0, 0);
  S.bone('thigh_near', 'pelvis', [9, 2], 0, 48);
  S.bone('shin_near', 'thigh_near', S.tip(), 0, 48);
  S.bone('foot_near', 'shin_near', S.tip(), 90, 15);
  S.bone('thigh_far', 'pelvis', [-9, 4], 0, 48);
  S.bone('shin_far', 'thigh_far', S.tip(), 0, 48);
  S.bone('foot_far', 'shin_far', S.tip(), 90, 15);
  S.bone('spine', 'pelvis', [0, -3], 178, 36);
  S.bone('chest', 'spine', S.tip(), 0, 38);
  S.bone('head', 'chest', S.tip(), 2, 48);
  S.bone('upper_arm_far', 'chest', [18, 29], 180, 29);
  S.bone('forearm_far', 'upper_arm_far', S.tip(), -8, 27);
  // The near arm reaches east. The sword then turns back up and east, keeping
  // the blade outside the torso instead of losing it in the armour.
  S.bone('upper_arm_near', 'chest', [-20, 29], -160, 29);
  S.bone('forearm_near', 'upper_arm_near', S.tip(), 40, 27);
  S.bone('sword', 'forearm_near', S.tip(), 87, 72);

  const steel: Color[] = [livery.steelLight, livery.steel, livery.steelDark];
  const mail: Color[] = [MAIL_LIGHT, MAIL, MAIL_DARK];
  const cloth: Color[] = [livery.clothLight, livery.cloth, livery.clothDark];
  const blade: Color[] = [BLADE_GLEAM, livery.steelLight, livery.steel, livery.steelDark, LEATHER, LEATHER_DARK];

  const parts: Part[] = [
    { name: 'cape', bone: 'spine', ramp: cloth, paint: cape(livery) },
    { name: 'upper_arm_far', bone: 'upper_arm_far', ramp: steel, paint: upperArm(livery, true) },
    { name: 'forearm_far', bone: 'forearm_far', ramp: [...steel, ...mail], paint: forearm(livery, true) },
    { name: 'thigh_far', bone: 'thigh_far', ramp: mail, paint: thigh(livery, true) },
    { name: 'shin_far', bone: 'shin_far', ramp: [...mail, ...steel], paint: shin(livery, true) },
    { name: 'foot_far', bone: 'foot_far', ramp: steel, paint: foot(livery, true) },
    { name: 'torso', bone: 'spine', ramp: [...mail, ...cloth, LEATHER, LEATHER_DARK], paint: torso(livery) },
    { name: 'chest', bone: 'chest', ramp: [...steel, ...cloth], paint: chest(livery) },
    { name: 'head', bone: 'head', ramp: [...steel, ...cloth, INK], paint: head(livery) },
    { name: 'thigh_near', bone: 'thigh_near', ramp: mail, paint: thigh(livery, false) },
    { name: 'shin_near', bone: 'shin_near', ramp: [...mail, ...steel], paint: shin(livery, false) },
    { name: 'foot_near', bone: 'foot_near', ramp: steel, paint: foot(livery, false) },
    { name: 'upper_arm_near', bone: 'upper_arm_near', ramp: steel, paint: upperArm(livery, false) },
    { name: 'forearm_near', bone: 'forearm_near', ramp: [...steel, ...mail, LEATHER], paint: forearm(livery, false) },
    { name: 'sword', bone: 'sword', ramp: blade, paint: sword(livery) },
  ];

  const clips = new Map<string, Motion>();
  clips.set('idle', idle());
  clips.set('walk', walk(dials));
  clips.set('slash', slash(dials));
  clips.set('walk_west', Motion.mirror('walk_west', 'walk', clips.get('walk')!));

  const restPose = (): Pose => {
    const pose: Pose = { deg: {} };
    S.solveChain(pose, 'thigh_near', 'shin_near', [108, GROUND_Y], 1, 'foot_near', 90);
    S.solveChain(pose, 'thigh_far', 'shin_far', [84, GROUND_Y], 1, 'foot_far', 88);
    return pose;
  };

  return {
    canvasW: CANVAS_W,
    canvasH: CANVAS_H,
    groundRow: GROUND_ROW,
    skeleton: S,
    parts,
    clips,
    grade: { ink: INK, shadow: SHADOW, emissiveLone: [] },
    shadow: { x: 25, y: 78, rx: 14, ry: 2 },
    restPose,
  };
}

// --- paints (bone-local, +Y along the bone) --------------------------------

function thigh(livery: Livery, far: boolean): Paint {
  const p = new Paint({ x: -14, y: -7, w: 28, h: 62 });
  p.capsule([0, 2], [0, 46], 10, 8, far ? MAIL_DARK : MAIL);
  if (!far) p.tintToward([-1, -0.4], MAIL_LIGHT, 3);
  p.occludeAbove(6, 8, 0.25);
  return p;
}

function shin(livery: Livery, far: boolean): Paint {
  const p = new Paint({ x: -15, y: -6, w: 30, h: 62 });
  p.capsule([0, 0], [0, 29], 8, 7, far ? MAIL_DARK : MAIL);
  p.polygon([[-9, 25], [9, 25], [11, 46], [6, 50], [-7, 50], [-10, 44]], far ? livery.steelDark : livery.steel);
  if (!far) p.tintToward([-1, -0.4], livery.steelLight, 3);
  return p;
}

function foot(livery: Livery, far: boolean): Paint {
  const p = new Paint({ x: -14, y: -9, w: 28, h: 34 });
  p.polygon([[-7, -4], [7, -4], [8, 12], [3, 16], [-7, 15], [-9, 6]], far ? livery.steelDark : livery.steel);
  if (!far) p.tintToward([1, -0.3], livery.steelLight, 2.5);
  return p;
}

function cape(livery: Livery): Paint {
  const p = new Paint({ x: -26, y: -8, w: 52, h: 62 });
  p.polygon([[9, 4], [18, 11], [16, 49], [5, 43], [-8, 51], [-13, 12]], livery.clothDark);
  p.tintToward([0.8, 0.4], livery.cloth, 4);
  return p;
}

function torso(livery: Livery): Paint {
  const p = new Paint({ x: -24, y: -8, w: 48, h: 58 });
  p.capsule([0, 3], [0, 39], 13, 12, MAIL);
  p.polygon([[-11, 8], [11, 8], [9, 40], [0, 45], [-10, 40]], livery.cloth);
  p.polygon([[-12, 8], [12, 8], [12, 14], [-12, 14]], LEATHER_DARK);
  p.disc([0, 11], 4, LEATHER);
  p.tintToward([0.8, 0.4], livery.clothLight, 3);
  p.tintToward([-0.8, -0.4], livery.clothDark, 3);
  return p;
}

function chest(livery: Livery): Paint {
  const p = new Paint({ x: -35, y: -8, w: 70, h: 56 });
  p.polygon([[-18, 2], [18, 2], [23, 12], [19, 34], [11, 40], [-12, 40], [-20, 32], [-23, 12]], livery.steel);
  p.polygon([[-6, 5], [7, 5], [7, 35], [0, 39], [-7, 34]], livery.cloth);
  p.disc([-23, 27], 10, livery.steelDark);
  p.disc([23, 27], 10, livery.steelDark);
  p.tintToward([0.9, 0.5], livery.steelLight, 4);
  p.tintToward([-0.8, -0.5], livery.steelDark, 3);
  p.occludeAbove(5, 8, 0.2);
  return p;
}

function head(livery: Livery): Paint {
  // On this upward bone, local -X is the east-facing side of the helmet.
  const p = new Paint({ x: -34, y: -5, w: 68, h: 68 });
  p.capsule([0, -2], [0, 18], 8, 9, livery.steelDark);
  p.polygon([[-24, 12], [18, 12], [25, 23], [23, 43], [14, 51], [-12, 54], [-24, 45], [-28, 26]], livery.steel);
  p.polygon([[-28, 27], [6, 29], [7, 39], [-27, 37]], livery.steelDark);
  p.polygon([[-23, 31], [-5, 32], [-6, 35], [-24, 34]], INK);
  p.polygon([[-17, 38], [-10, 38], [-12, 18], [-17, 20]], livery.steelLight);
  // A short cloth crest makes the helmet readable even when the visor is dark.
  p.polygon([[1, 50], [8, 60], [16, 56], [13, 47]], livery.cloth);
  p.tintToward([0.8, 0.7], livery.steelLight, 3);
  p.tintToward([0, -1], livery.steelDark, 2.5);
  return p;
}

function upperArm(livery: Livery, far: boolean): Paint {
  const p = new Paint({ x: -14, y: -7, w: 28, h: 44 });
  p.disc([0, 2], 11, far ? livery.steelDark : livery.steel);
  p.capsule([0, 5], [0, 29], 8, 6, far ? livery.steelDark : livery.steel);
  if (!far) p.tintToward([-1, -0.3], livery.steelLight, 3);
  p.occludeAbove(5, 7, 0.2);
  return p;
}

function forearm(livery: Livery, far: boolean): Paint {
  const p = new Paint({ x: -13, y: -6, w: 26, h: 44 });
  p.capsule([0, 0], [0, 23], 7, 5.5, far ? MAIL_DARK : MAIL);
  p.polygon([[-8, 9], [8, 9], [7, 25], [-6, 27], [-9, 20]], far ? livery.steelDark : livery.steel);
  p.disc([0, 27], 6, far ? MAIL_DARK : LEATHER);
  if (!far) p.tintToward([-1, -0.3], livery.steelLight, 2.5);
  return p;
}

function sword(livery: Livery): Paint {
  const p = new Paint({ x: -18, y: -14, w: 36, h: 94 });
  // Pommel, wrapped grip and broad crossguard overlap the hand at the origin.
  p.disc([0, -8], 6, livery.steelDark);
  p.capsule([0, -7], [0, 10], 4.5, 4.5, LEATHER);
  p.capsule([-15, 11], [15, 11], 4, 4, livery.steelDark);
  // A broad taper survives the pixel grade and gives the blade a straight edge.
  p.polygon([[-5, 11], [5, 11], [4, 62], [0, 74], [-4, 62]], livery.steelLight);
  p.polygon([[-5, 11], [0, 12], [0, 68], [-4, 62]], livery.steel);
  p.tintToward([1, -0.2], BLADE_GLEAM, 2.5);
  return p;
}

// --- clips -----------------------------------------------------------------

function plantFeet(c: Motion): void {
  c.plant('thigh_near', 'shin_near', 'foot_near', { 0: [108, GROUND_Y, 90] });
  c.plant('thigh_far', 'shin_far', 'foot_far', { 0: [84, GROUND_Y, 88] });
}

function idle(): Motion {
  const c = new Motion('idle', 1.8);
  c.bakeFps = 12;
  plantFeet(c);
  c.key('root_y', { 0: 0, 0.9: -2 });
  c.key('spine', { 0: -1, 0.9: 1 });
  c.key('head', { 0.2: 1.5, 1.1: -1.5 });
  c.key('upper_arm_near', { 0: -2, 0.9: 2 });
  c.key('forearm_near', { 0: 2, 0.9: -2 });
  c.key('sword', { 0: -1.5, 0.9: 1.5 });
  return c;
}

function walk(dials: Dials): Motion {
  const c = new Motion('walk', 0.8);
  c.bakeFps = 15;
  c.gait('thigh_near', 'shin_near', 'foot_near', dials.stride, 18, 0, GROUND_Y, 6, 0.65);
  c.gait('thigh_far', 'shin_far', 'foot_far', dials.stride, 18, 0.5, GROUND_Y, -6, 0.65);
  c.key('root_y', { 0: 2, 0.2: -2, 0.4: 2, 0.6: -2 });
  c.key('spine', { 0: -3, 0.4: 3 });
  c.key('head', { 0: 2, 0.4: -2 });
  c.key('upper_arm_far', { 0: 14, 0.4: -14 });
  c.key('forearm_far', { 0: 10, 0.4: 18 });
  // The weapon arm stays guarded instead of swinging through the blade.
  c.key('upper_arm_near', { 0: -5, 0.4: 5 });
  c.key('forearm_near', { 0: 3, 0.4: -3 });
  c.key('sword', { 0: -3, 0.4: 3 });
  return c;
}

function slash(dials: Dials): Motion {
  const c = new Motion('slash', 1.15, false);
  c.bakeFps = 15;
  c.wobbleBudget = 4.5;
  plantFeet(c);
  c.key('root_x', { 0: 0, 0.2: -3, 0.48: 6, 0.78: 1, 1.15: 0 }, 'outBack');
  c.key('root_y', { 0: 0, 0.2: 3, 0.48: -2, 0.78: 1, 1.15: 0 });
  c.key('spine', { 0: 0, 0.2: 10, 0.48: -12, 0.78: 4, 1.15: 0 }, 'outBack');
  c.key('head', { 0: 0, 0.2: -5, 0.48: 7, 1.15: 0 });
  c.key('upper_arm_near', { 0: 0, 0.2: -24, 0.48: 35, 0.78: 12, 1.15: 0 }, 'outBack');
  c.key('forearm_near', { 0: 0, 0.2: -18, 0.48: 20, 0.78: 8, 1.15: 0 });
  c.key('sword', { 0: 0, 0.2: dials.swordArc * 0.25, 0.48: -dials.swordArc, 0.78: -20, 1.15: 0 }, 'outBack');
  c.key('upper_arm_far', { 0: 0, 0.2: 8, 0.48: -12, 1.15: 0 });
  return c;
}
