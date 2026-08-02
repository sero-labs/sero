/**
 * The second reference puppet — "Rivet", a stubby service robot.
 *
 * Scout exists to show the technique working; this one exists to show it
 * working on a character built from the OPPOSITE materials, so the engine's
 * shape is visible rather than one character's style.
 *
 *   Scout is soft: tapered capsules, cloth, a hood, a running gait.
 *   Rivet is hard: flat polygon panels, a hinged jaw of a chassis, a stiff
 *   antenna instead of a scarf, and a plodding walk.
 *
 * Three things here are deliberately different, and each is a thing an author
 * needs to be able to do:
 *
 *  - **Polygons, not capsules.** A robot is bevels and corners. `polygon` fills
 *    a closed path, so the dome's flat crown, the chest's chamfer and the
 *    shoulder plates are drawn as the shapes they are instead of being
 *    approximated by round ends.
 *  - **A stiff chain.** The scarf streams; the antenna stands up and wobbles.
 *    Same verlet chain, low gravity and high stiffness — the difference between
 *    cloth and a springy rod is four numbers, not different code.
 *  - **It obeys the size floor.** Scout predates the fill gate and declares a
 *    lower one. Rivet spans 0.8 of the canvas and takes the default, so the
 *    example an author reads first is the one that got it right.
 *
 * Canvas 64 x 80 at 1x; all skeleton and paint coordinates are supersampled px
 * (4x). The ankle plants at y = 288 ss; groundRow is measured from the rest
 * bake, not guessed.
 */

import type { CharacterSpec, Color, Part, Pose, Vec } from '../src/index';
import { Motion, Paint, Skeleton, hex } from '../src/index';

export const CANVAS_W = 64;
export const CANVAS_H = 80;
/** Where the ankles plant, ss. */
const GROUND_Y = 288;
/** Measured from the rest bake (stats().feet): the sole plus its ink outline. */
const GROUND_ROW = 76;

// --- palette ---------------------------------------------------------------

export interface Finish {
  shellLight: Color;
  shell: Color;
  shellDark: Color;
  trimLight: Color;
  trim: Color;
  trimDark: Color;
}

/** The default look; retheme = pass different hexes and rebake. */
export const RUST: Finish = {
  shellLight: hex('cfd6dd'),
  shell: hex('8d99a6'),
  shellDark: hex('4c5866'),
  trimLight: hex('ffb45e'),
  trim: hex('d97b2c'),
  trimDark: hex('8a4715'),
};

export const MOSS: Finish = {
  shellLight: hex('c8d6c4'),
  shell: hex('7f9480'),
  shellDark: hex('42544a'),
  trimLight: hex('9be9ff'),
  trim: hex('3fb8e0'),
  trimDark: hex('1e6a8c'),
};

const INK = hex('14161f');
const IRON_LIGHT = hex('8b95a4');
const IRON = hex('5c6673');
const IRON_DARK = hex('373f4d');
const OPTIC = hex('65f7c8');
const OPTIC_CORE = hex('e9fff8');
const SHADOW: Color = [0.03, 0.03, 0.09, 0.45];

// --- dials the demo UI exposes ---------------------------------------------

export interface Dials {
  /** Walk stride, ss px. A heavy robot takes short steps. */
  stride: number;
  /** How hard the antenna is shaken about, ss px/s^2. */
  antennaWind: number;
}

export const DEFAULT_DIALS: Dials = { stride: 46, antennaWind: -520 };

// --- the puppet ------------------------------------------------------------

export function buildCharacter(finish: Finish = RUST, dials: Dials = DEFAULT_DIALS): CharacterSpec {
  const S = new Skeleton();
  // Short legs on a heavy body: the pelvis sits at 216 with the ankles at 288,
  // so 72 of the 76 ss of leg is used standing — almost straight, which is what
  // makes a plod read as weight rather than a crouch.
  S.rootPos = [128, 196];
  S.bone('pelvis', '', [0, 0], 0, 0);
  S.bone('thigh_near', 'pelvis', [17, 4], 0, 46);
  S.bone('shin_near', 'thigh_near', S.tip(), 0, 46);
  S.bone('foot_near', 'shin_near', S.tip(), 90, 16);
  S.bone('thigh_far', 'pelvis', [-17, 6], 0, 46);
  S.bone('shin_far', 'thigh_far', S.tip(), 0, 46);
  S.bone('foot_far', 'shin_far', S.tip(), 90, 16);
  S.bone('spine', 'pelvis', [0, -4], 178, 34);
  S.bone('chest', 'spine', S.tip(), 0, 44);
  S.bone('head', 'chest', S.tip(), 2, 54);
  S.bone('upper_arm_near', 'chest', [-30, 40], 186, 34);
  S.bone('forearm_near', 'upper_arm_near', S.tip(), -6, 30);
  S.bone('upper_arm_far', 'chest', [30, 38], 190, 34);
  S.bone('forearm_far', 'upper_arm_far', S.tip(), -4, 30);
  // The antenna: the same verlet chain the scarf uses, told to behave like a
  // rod. Low gravity so it stands, high stiffness so it returns to upright, a
  // short taper so the tip is what moves. restDir is bone-local, and the head
  // bone points UP, so [0, 1] is straight up the screen.
  S.chain('antenna', 'head', [6, 52], 3, 9, [-260, 0], 300, 0.9, 0.5, 0.74, [0, 1]);

  const shell: Color[] = [finish.shellLight, finish.shell, finish.shellDark];
  const iron: Color[] = [IRON_LIGHT, IRON, IRON_DARK];
  const trim: Color[] = [finish.trimLight, finish.trim, finish.trimDark];

  const parts: Part[] = [
    { name: 'antenna', chain: 'antenna', ramp: trim, painter: antenna(finish) },
    { name: 'upper_arm_far', bone: 'upper_arm_far', ramp: iron, paint: upperArm(finish, true) },
    { name: 'forearm_far', bone: 'forearm_far', ramp: [...iron, ...shell], paint: forearm(finish, true) },
    { name: 'thigh_far', bone: 'thigh_far', ramp: iron, paint: thigh(finish, true) },
    { name: 'shin_far', bone: 'shin_far', ramp: [...iron, ...shell], paint: shin(finish, true) },
    { name: 'foot_far', bone: 'foot_far', ramp: [...iron, ...shell], paint: foot(finish, true) },
    { name: 'hips', bone: 'spine', ramp: [...iron, ...trim], paint: hips(finish) },
    { name: 'chest', bone: 'chest', ramp: [...shell, ...iron, ...trim], paint: chest(finish) },
    { name: 'head', bone: 'head', ramp: [...shell, ...iron, OPTIC, OPTIC_CORE], paint: head(finish) },
    { name: 'thigh_near', bone: 'thigh_near', ramp: iron, paint: thigh(finish, false) },
    { name: 'shin_near', bone: 'shin_near', ramp: [...iron, ...shell], paint: shin(finish, false) },
    { name: 'foot_near', bone: 'foot_near', ramp: [...iron, ...shell], paint: foot(finish, false) },
    { name: 'upper_arm_near', bone: 'upper_arm_near', ramp: iron, paint: upperArm(finish, false) },
    { name: 'forearm_near', bone: 'forearm_near', ramp: [...iron, ...shell], paint: forearm(finish, false) },
  ];

  const clips = new Map<string, Motion>();
  clips.set('idle', idle(dials));
  clips.set('walk', walk(dials));
  clips.set('startle', startle(dials));
  clips.set('walk_west', Motion.mirror('walk_west', 'walk', clips.get('walk')!));

  const restPose = (): Pose => {
    const pose: Pose = { deg: {} };
    S.solveChain(pose, 'thigh_near', 'shin_near', [146, GROUND_Y], 1, 'foot_near', 90);
    S.solveChain(pose, 'thigh_far', 'shin_far', [110, GROUND_Y], 1, 'foot_far', 88);
    return pose;
  };

  return {
    canvasW: CANVAS_W,
    canvasH: CANVAS_H,
    groundRow: GROUND_ROW,
    skeleton: S,
    parts,
    clips,
    grade: { ink: INK, shadow: SHADOW, emissiveLone: [OPTIC, OPTIC_CORE] },
    shadow: { x: 32, y: 78, rx: 14, ry: 2 },
    restPose,
  };
}

// --- paints (bone-local, +Y along the bone) --------------------------------

/** A bevelled slab: a rectangle with its corners cut, which is the shape
 * almost every panel on this character is. `w` is the half-width. */
function slab(p: Paint, y0: number, y1: number, w: number, bevel: number, c: Color): void {
  p.polygon(
    [
      [-w + bevel, y0],
      [w - bevel, y0],
      [w, y0 + bevel],
      [w, y1 - bevel],
      [w - bevel, y1],
      [-w + bevel, y1],
      [-w, y1 - bevel],
      [-w, y0 + bevel],
    ],
    c,
  );
}

function thigh(finish: Finish, far: boolean): Paint {
  const p = new Paint({ x: -26, y: -8, w: 52, h: 64 });
  slab(p, 2, 46, far ? 13 : 15, 4, far ? IRON_DARK : IRON);
  if (!far) {
    p.tintToward([-1, -0.3], IRON_LIGHT, 6);
    p.tintToward([1, 0.3], IRON_DARK, 5);
  }
  // The hip pivot, a dark disc, so the joint reads as a hinge and not a seam.
  p.disc([0, 3], 11, far ? IRON_DARK : IRON_LIGHT);
  p.occludeAbove(5, 8, 0.25);
  return p;
}

function shin(finish: Finish, far: boolean): Paint {
  const p = new Paint({ x: -28, y: -8, w: 56, h: 64 });
  slab(p, 0, 32, far ? 11 : 13, 3.5, far ? IRON_DARK : IRON);
  // The boot: wider than the shin, which is what makes a robot look planted.
  slab(p, 32, 46, far ? 16 : 18, 4.5, far ? finish.shellDark : finish.shell);
  if (!far) {
    p.tintToward([-1, -0.3], IRON_LIGHT, 5);
    p.tintToward([1, 0.4], IRON_DARK, 5);
  }
  p.disc([0, 1], 10, far ? finish.shellDark : finish.shell);
  return p;
}

function foot(finish: Finish, far: boolean): Paint {
  // The foot bone points toe-ward (rest 90 = east): +Y = toe, -X = the sole.
  const p = new Paint({ x: -26, y: -16, w: 52, h: 44 });
  slab(p, -6, 17, 14, 4, far ? finish.shellDark : finish.shell);
  if (!far) p.tintToward([1, -0.3], finish.shell, 3);
  return p;
}

function hips(finish: Finish): Paint {
  // An upward bone: local +Y is up the screen, local +X is screen-WEST.
  const p = new Paint({ x: -40, y: -10, w: 80, h: 60 });
  slab(p, 0, 34, 17, 5, IRON);
  // The power belt, the one warm band low on the body.
  slab(p, 8, 17, 19, 3, finish.trimDark);
  slab(p, 11, 14, 20, 2, finish.trim);
  p.tintToward([0.9, 0.4], IRON_LIGHT, 5);
  p.tintToward([-0.9, -0.4], IRON_DARK, 4);
  return p;
}

function chest(finish: Finish): Paint {
  const p = new Paint({ x: -52, y: -12, w: 104, h: 76 });
  // The chassis: wide at the shoulders, chamfered down to the waist.
  p.polygon(
    [
      [-26, 40],
      [26, 40],
      [26, 26],
      [21, 9],
      [16, 0],
      [-16, 0],
      [-21, 9],
      [-26, 26],
    ],
    finish.shell,
  );
  // The shoulder plates, drawn past the chassis so the arms hang under them.
  p.polygon([[-36, 41], [-18, 45], [-13, 33], [-28, 28]], finish.shellDark);
  p.polygon([[36, 41], [18, 45], [13, 33], [28, 28]], finish.shellDark);
  // A vent stack and the chest hatch — flat panels, no shading, so the eye
  // reads them as machined rather than moulded.
  slab(p, 13, 30, 15, 4, finish.shellDark);
  slab(p, 16, 27, 10, 2.5, IRON_DARK);
  for (const y of [18, 23]) p.polygon([[-9, y], [9, y], [9, y + 2.5], [-9, y + 2.5]], finish.trim);
  p.tintToward([0.9, 0.5], finish.shellLight, 3);
  p.tintToward([-0.8, -0.5], finish.shellDark, 3);
  p.occludeAbove(4, 8, 0.2);
  return p;
}

function head(finish: Finish): Paint {
  // An upward bone: local +X is screen-WEST, so the face looks toward -X.
  const p = new Paint({ x: -44, y: -10, w: 88, h: 72 });
  // A short neck post, so the dome does not sit straight on the shoulders.
  slab(p, -2, 18, 9, 2, IRON_DARK);
  // The dome: a flat crown over a jaw that juts forward — the silhouette that
  // says "machine" before any detail is visible.
  p.polygon(
    [
      [-26, 14],
      [24, 14],
      [30, 27],
      [24, 50],
      [10, 55],
      [-18, 55],
      [-32, 46],
      [-33, 25],
    ],
    finish.shell,
  );
  // The visor band, sunk into the face side.
  p.polygon([[-33, 29], [-4, 31], [-4, 42], [-33, 39]], IRON_DARK);
  p.disc([-22, 35], 8, OPTIC);
  p.disc([-25, 36], 3.5, OPTIC_CORE);
  // The antenna socket, so the chain has something to grow out of.
  slab(p, 48, 58, 8, 2, IRON);
  p.tintToward([0.8, 0.7], finish.shellLight, 3);
  p.tintToward([0, -1], finish.shellDark, 2.5);
  return p;
}

function upperArm(finish: Finish, far: boolean): Paint {
  const p = new Paint({ x: -24, y: -8, w: 48, h: 52 });
  slab(p, 0, 34, far ? 11 : 13, 3.5, far ? IRON_DARK : IRON);
  p.disc([0, 1], 10, far ? IRON_DARK : finish.shellDark);
  if (!far) p.tintToward([-1, -0.3], IRON_LIGHT, 4);
  p.occludeAbove(4, 7, 0.25);
  return p;
}

function forearm(finish: Finish, far: boolean): Paint {
  const p = new Paint({ x: -24, y: -8, w: 48, h: 52 });
  slab(p, 0, 22, far ? 10 : 12, 3.5, far ? IRON_DARK : IRON);
  // The grabber: two fingers with a gap, which is why it needs a polygon and
  // not a capsule — a rounded end cannot be open.
  p.polygon([[-11, 22], [-3.5, 22], [-3.5, 34], [-11, 31]], far ? IRON_DARK : IRON_LIGHT);
  p.polygon([[11, 22], [3.5, 22], [3.5, 34], [11, 31]], far ? IRON_DARK : IRON_LIGHT);
  if (!far) p.tintToward([-1, -0.3], IRON_LIGHT, 4);
  return p;
}

/** The antenna is painted along the simulated points, like the scarf — but as
 * a thin taper with a lamp on the end. */
function antenna(finish: Finish): (p: Paint, pts: readonly Vec[]) => void {
  return (p: Paint, pts: readonly Vec[]) => {
    // Half-widths in SUPERSAMPLED px: under about 3 the rod comes out below the
    // grade's coverage threshold, breaks into specks and detaches from the head.
    p.ribbon(pts, 9, 6, finish.trimDark);
    p.tintToward([-1, -0.3], finish.trim, 1.5);
    const tip = pts[pts.length - 1];
    p.disc(tip, 8, finish.trim);
    p.disc([tip[0] - 2, tip[1] - 2], 3.5, finish.trimLight);
  };
}

// --- clips -----------------------------------------------------------------

function idle(dials: Dials): Motion {
  const c = new Motion('idle', 2);
  c.bakeFps = 12;
  c.wind = [dials.antennaWind * 0.25, 0];
  c.plant('thigh_near', 'shin_near', 'foot_near', { 0: [146, GROUND_Y, 90] });
  c.plant('thigh_far', 'shin_far', 'foot_far', { 0: [110, GROUND_Y, 88] });
  // A machine idles by settling, not breathing: the body sinks a hair and the
  // head lags behind it.
  c.key('root_y', { 0: 0, 1: 2 });
  c.key('spine', { 0: 0.8, 1: -0.8 });
  c.key('chest', { 0: -1, 1: 1 });
  c.key('head', { 0.2: -1.5, 1.2: 1.5 });
  c.key('upper_arm_near', { 0: 1.5, 1: -1.5 });
  c.key('forearm_near', { 0: -2, 1: 2 });
  c.key('upper_arm_far', { 0: -1.5, 1: 1.5 });
  c.key('forearm_far', { 0: 2, 1: -2 });
  return c;
}

function walk(dials: Dials): Motion {
  const c = new Motion('walk', 0.9);
  c.bakeFps = 12;
  c.wind = [dials.antennaWind, 0];
  c.wobbleBudget = 3;
  // A long contact fraction is what makes it a plod rather than a run: both
  // feet are down most of the cycle and it never leaves the ground.
  c.gait('thigh_near', 'shin_near', 'foot_near', dials.stride, 16, 0, GROUND_Y, 18, 0.68);
  c.gait('thigh_far', 'shin_far', 'foot_far', dials.stride, 16, 0.5, GROUND_Y, -18, 0.68);
  c.key('root_y', { 0: 3, 0.225: -1, 0.45: 3, 0.675: -1 });
  c.key('spine', { 0: -3, 0.45: 3 });
  c.key('chest', { 0: 1.5, 0.45: -1.5 });
  c.key('head', { 0: 2, 0.45: -2 });
  c.key('upper_arm_near', { 0: -12, 0.45: 12 });
  c.key('forearm_near', { 0: 8, 0.45: 14 });
  c.key('upper_arm_far', { 0: 12, 0.45: -12 });
  c.key('forearm_far', { 0: 14, 0.45: 8 });
  return c;
}

/**
 * A startle: the one clip that does not loop.
 *
 * It exists to prove the action path — a clip that begins and ends at rest,
 * where the wrap check does not apply and the pose has to return by itself.
 */
function startle(dials: Dials): Motion {
  const c = new Motion('startle', 1.1, false);
  c.bakeFps = 15;
  // A startle IS a lurch: the budget is declared bigger on purpose rather than
  // the motion being flattened to fit the default.
  c.wobbleBudget = 3.5;
  c.wind = [dials.antennaWind * 1.1, 0];
  c.plant('thigh_near', 'shin_near', 'foot_near', {
    0: [146, GROUND_Y, 90],
    0.12: [149, GROUND_Y, 90],
    0.45: [143, GROUND_Y, 90],
    1.1: [146, GROUND_Y, 90],
  });
  c.plant('thigh_far', 'shin_far', 'foot_far', {
    0: [110, GROUND_Y, 88],
    0.12: [106, GROUND_Y, 88],
    0.45: [113, GROUND_Y, 88],
    1.1: [110, GROUND_Y, 88],
  });
  // Snap back, hold, then settle — an outBack ease on the recovery so it
  // overshoots the way sprung metal does.
  c.key('root_y', { 0: 0, 0.12: -5, 0.4: 3, 0.7: -1, 1.1: 0 }, 'outBack');
  c.key('spine', { 0: 0, 0.12: 9, 0.4: -4, 0.7: 2, 1.1: 0 }, 'outBack');
  c.key('chest', { 0: 0, 0.12: 7, 0.4: -3, 1.1: 0 });
  c.key('head', { 0: 0, 0.12: -9, 0.4: 5, 0.7: -2, 1.1: 0 });
  c.key('upper_arm_near', { 0: 0, 0.12: -34, 0.4: 12, 0.7: -4, 1.1: 0 });
  c.key('forearm_near', { 0: 0, 0.12: 42, 0.4: 10, 1.1: 0 });
  c.key('upper_arm_far', { 0: 0, 0.12: -28, 0.4: 10, 0.7: -3, 1.1: 0 });
  c.key('forearm_far', { 0: 0, 0.12: 38, 0.4: 8, 1.1: 0 });
  return c;
}
