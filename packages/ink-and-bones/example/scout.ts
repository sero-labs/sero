/**
 * The reference puppet — "Scout", a hooded runner with a scarf.
 *
 * THIS FILE IS THE ARTIFACT AN AI WOULD AUTHOR: a skeleton, painted parts,
 * and clips as eased curves, exported as a CharacterSpec. Everything else is
 * fixed engine. Every number here is a named dial an LLM (or a person) can
 * change in a one-line diff, and the bake is deterministic — same file, same
 * frames, every time.
 *
 * Canvas 64 x 80 at 1x; all skeleton/paint coordinates are supersampled px
 * (4x). Ankle plant line y = 296 ss; the rest frame's lowest opaque row
 * (outline included) is the declared groundRow.
 */

import type { CharacterSpec, Color, Part, Pose, Vec } from '../src/index';
import { Motion, Paint, Skeleton, hex } from '../src/index';

export const CANVAS_W = 64;
export const CANVAS_H = 80;
const GROUND_Y = 296;
// Measured from the rest bake (stats().feet), not eyeballed: the ankle
// plants at 296 ss = row 74, and the ink outline under the boots adds one.
const GROUND_ROW = 75;

// --- palette ---------------------------------------------------------------

export interface Theme {
  suitLight: Color;
  suit: Color;
  suitDark: Color;
  scarfLight: Color;
  scarf: Color;
  scarfDark: Color;
}

/** The default look; retheme = pass different hexes and rebake. */
export const DUSK: Theme = {
  suitLight: hex('7b90a8'),
  suit: hex('4e5f78'),
  suitDark: hex('313d52'),
  scarfLight: hex('ffc95e'),
  scarf: hex('f29a3a'),
  scarfDark: hex('b96a26'),
};

export const EMBER: Theme = {
  suitLight: hex('a8837b'),
  suit: hex('784e4e'),
  suitDark: hex('4a2f31'),
  scarfLight: hex('9be9ff'),
  scarf: hex('4fc3e8'),
  scarfDark: hex('2a7fa8'),
};

const INK = hex('151221');
const SKIN = hex('e8b48c');
const SKIN_SHADE = hex('c08b62');
const BOOT_LIGHT = hex('8a6f52');
const BOOT = hex('63503c');
const BOOT_DARK = hex('443528');
const EYE = hex('59f2e0');
const EYE_CORE = hex('eafffb');
const SHADOW: Color = [0.03, 0.02, 0.1, 0.45];

// --- dials the demo UI exposes ---------------------------------------------

export interface Dials {
  /** Run stride, ss px. */
  stride: number;
  /** Headwind on the scarf, ss px/s^2 (negative = streams west). Full
   * strength in the run, scaled down in the idle and the jump. */
  runWind: number;
}

export const DEFAULT_DIALS: Dials = { stride: 88, runWind: -2200 };

// --- the puppet ------------------------------------------------------------

export function buildCharacter(theme: Theme = DUSK, dials: Dials = DEFAULT_DIALS): CharacterSpec {
  const S = new Skeleton();
  // Pelvis height sets the knee bend everywhere: ankle plants at y 296, so
  // 222 leaves a 74 of 80 reach — near-straight standing legs that still
  // have flex to spend in the run.
  S.rootPos = [128, 222];
  S.bone('pelvis', '', [0, 0], 0, 0);
  S.bone('thigh_near', 'pelvis', [9, 2], 0, 40);
  S.bone('shin_near', 'thigh_near', S.tip(), 0, 40);
  S.bone('foot_near', 'shin_near', S.tip(), 90, 13);
  S.bone('thigh_far', 'pelvis', [-9, 4], 0, 40);
  S.bone('shin_far', 'thigh_far', S.tip(), 0, 40);
  S.bone('foot_far', 'shin_far', S.tip(), 90, 13);
  S.bone('spine', 'pelvis', [0, -2], 172, 44);
  S.bone('chest', 'spine', S.tip(), 0, 36);
  S.bone('head', 'chest', S.tip(), 6, 44);
  S.bone('upper_arm_near', 'chest', [-3, 32], 186, 30);
  S.bone('forearm_near', 'upper_arm_near', S.tip(), -8, 26);
  S.bone('upper_arm_far', 'chest', [3, 30], 190, 30);
  S.bone('forearm_far', 'upper_arm_far', S.tip(), -6, 26);
  // The scarf: anchored high on the back of the chest. Stiffness pins the
  // collar to restDir (down and west of the chest's own frame), the tapered
  // wind bends the tip — that difference is what makes it read as cloth.
  S.chain('scarf', 'chest', [7, 26], 7, 11, [-850, 0], 3000, 0.975, 0.15, 0.22, [0.45, -1]);

  const suit: Color[] = [theme.suitLight, theme.suit, theme.suitDark];
  const boots: Color[] = [BOOT_LIGHT, BOOT, BOOT_DARK];
  const scarfRamp: Color[] = [theme.scarfLight, theme.scarf, theme.scarfDark];

  const parts: Part[] = [
    {
      name: 'scarf',
      chain: 'scarf',
      ramp: scarfRamp,
      painter: (p: Paint, pts: readonly Vec[]) => {
        p.ribbon(pts, 7, 2.8, theme.scarf);
        p.tintToward([-0.4, -1], theme.scarfLight, 2.2);
        p.tintToward([0.4, 1], theme.scarfDark, 2.2);
      },
    },
    { name: 'upper_arm_far', bone: 'upper_arm_far', ramp: suit, paint: upperArm(theme, true) },
    { name: 'forearm_far', bone: 'forearm_far', ramp: [...suit, SKIN, SKIN_SHADE], paint: forearm(theme, true) },
    { name: 'thigh_far', bone: 'thigh_far', ramp: suit, paint: thigh(theme, true) },
    { name: 'shin_far', bone: 'shin_far', ramp: [...suit, ...boots], paint: shin(theme, true) },
    { name: 'foot_far', bone: 'foot_far', ramp: boots, paint: foot(true) },
    { name: 'torso', bone: 'spine', ramp: [...suit, BOOT_DARK], paint: torso(theme) },
    { name: 'chest', bone: 'chest', ramp: suit, paint: chest(theme) },
    { name: 'head', bone: 'head', ramp: [...suit, SKIN, SKIN_SHADE, EYE, EYE_CORE], paint: head(theme) },
    { name: 'thigh_near', bone: 'thigh_near', ramp: suit, paint: thigh(theme, false) },
    { name: 'shin_near', bone: 'shin_near', ramp: [...suit, ...boots], paint: shin(theme, false) },
    { name: 'foot_near', bone: 'foot_near', ramp: boots, paint: foot(false) },
    { name: 'upper_arm_near', bone: 'upper_arm_near', ramp: suit, paint: upperArm(theme, false) },
    { name: 'forearm_near', bone: 'forearm_near', ramp: [...suit, SKIN, SKIN_SHADE], paint: forearm(theme, false) },
  ];

  const clips = new Map<string, Motion>();
  clips.set('idle', idle(dials));
  clips.set('run', run(dials));
  clips.set('jump', jump(dials));
  clips.set('run_west', Motion.mirror('run_west', 'run', clips.get('run')!));

  const restPose = (): Pose => {
    const pose: Pose = { deg: {} };
    S.solveChain(pose, 'thigh_near', 'shin_near', [140, GROUND_Y], 1, 'foot_near', 90);
    S.solveChain(pose, 'thigh_far', 'shin_far', [116, GROUND_Y], 1, 'foot_far', 88);
    return pose;
  };

  return {
    canvasW: CANVAS_W,
    canvasH: CANVAS_H,
    groundRow: GROUND_ROW,
    // Below the 0.75 the fill gate now asks of a new character, and honestly
    // so: Scout was drawn in the spike before any size guidance existed and
    // leaves 23 rows of air above its hood. Its geometry is frozen by the
    // golden frames, so it declares what it measures rather than pretending.
    // A character authored today should not copy this number.
    minFill: 0.65,
    skeleton: S,
    parts,
    clips,
    grade: { ink: INK, shadow: SHADOW, emissiveLone: [EYE, EYE_CORE] },
    shadow: { x: 32, y: 78, rx: 13, ry: 2 },
    restPose,
  };
}

// --- paints (bone-local, +Y along the bone) --------------------------------

function thigh(theme: Theme, far: boolean): Paint {
  const p = new Paint({ x: -14, y: -6, w: 28, h: 52 });
  p.capsule([0, 2], [0, 40], 10, 8, far ? theme.suitDark : theme.suit);
  if (!far) {
    p.tintToward([-1, -0.4], theme.suitLight, 3.5);
    p.tintToward([1, 0.4], theme.suitDark, 3);
  }
  p.occludeAbove(6, 8, 0.25);
  return p;
}

function shin(theme: Theme, far: boolean): Paint {
  const p = new Paint({ x: -12, y: -4, w: 24, h: 50 });
  p.capsule([0, 0], [0, 26], 8, 6.5, far ? theme.suitDark : theme.suit);
  p.capsule([0, 24], [0, 40], 7, 6, far ? BOOT_DARK : BOOT);
  if (!far) {
    p.tintToward([-1, -0.4], theme.suitLight, 2.5);
    p.tintToward([1, 0.5], theme.suitDark, 2.5);
  }
  return p;
}

function foot(far: boolean): Paint {
  // Foot bone points toe-ward (rest 90 = east): +Y = toe, -X = the sole.
  const p = new Paint({ x: -12, y: -8, w: 24, h: 28 });
  p.capsule([2, -2], [0, 11], 6, 4.5, far ? BOOT_DARK : BOOT);
  if (!far) p.tintToward([1, -0.3], BOOT_LIGHT, 2);
  return p;
}

function torso(theme: Theme): Paint {
  const p = new Paint({ x: -20, y: -8, w: 40, h: 58 });
  p.capsule([0, 4], [0, 42], 11.5, 13, theme.suit);
  // belt
  p.capsule([-10, 9], [10, 9], 3.5, 3.5, BOOT_DARK);
  p.tintToward([0.8, 0.5], theme.suitLight, 3);
  p.tintToward([-0.7, -0.5], theme.suitDark, 3);
  return p;
}

function chest(theme: Theme): Paint {
  const p = new Paint({ x: -20, y: -6, w: 40, h: 48 });
  p.capsule([0, 0], [0, 34], 13, 10.5, theme.suit);
  p.tintToward([0.7, 0.7], theme.suitLight, 4);
  p.tintToward([-0.5, -0.8], theme.suitDark, 3.5);
  p.occludeAbove(4, 8, 0.2);
  return p;
}

function head(theme: Theme): Paint {
  // Upward bone: local +X is screen-WEST, the face is -X.
  const p = new Paint({ x: -26, y: -4, w: 52, h: 52 });
  p.disc([1, 25], 19, theme.suit); // hood shell
  p.disc([-9, 24], 11, SKIN); // face opening
  p.tintToward([-0.9, -0.4], SKIN_SHADE, 2.5); // jaw shade
  p.disc([-12, 27], 2.8, EYE); // the emissive: the gaze, always east
  p.disc([-13, 28], 1.2, EYE_CORE);
  p.tintToward([0.6, 0.8], theme.suitLight, 3.5); // hood lit from top-left
  p.tintToward([0, -1], theme.suitDark, 2.5); // hood underside
  return p;
}

function upperArm(theme: Theme, far: boolean): Paint {
  const p = new Paint({ x: -11, y: -6, w: 22, h: 42 });
  p.capsule([0, 0], [0, 30], 7, 6, far ? theme.suitDark : theme.suit);
  if (!far) p.tintToward([-1, -0.3], theme.suitLight, 2.5);
  p.occludeAbove(4, 7, 0.25);
  return p;
}

function forearm(theme: Theme, far: boolean): Paint {
  const p = new Paint({ x: -10, y: -4, w: 20, h: 40 });
  p.capsule([0, 0], [0, 24], 6, 5, far ? theme.suitDark : theme.suit);
  p.disc([0, 27], 5, far ? SKIN_SHADE : SKIN); // the hand
  if (!far) p.tintToward([-1, -0.3], theme.suitLight, 2);
  return p;
}

// --- clips -----------------------------------------------------------------

function idle(dials: Dials): Motion {
  const c = new Motion('idle', 1.6);
  c.bakeFps = 12;
  c.wind = [-150 + dials.runWind * 0.4, 0];
  c.plant('thigh_near', 'shin_near', 'foot_near', { 0: [140, GROUND_Y, 90] });
  c.plant('thigh_far', 'shin_far', 'foot_far', { 0: [116, GROUND_Y, 88] });
  c.key('root_y', { 0: 1, 0.8: -2 });
  c.key('spine', { 0: -2, 0.8: 1 });
  c.key('chest', { 0: 2, 0.8: -1 });
  c.key('head', { 0.2: 1.5, 1.0: -2 });
  c.key('upper_arm_near', { 0: 2, 0.8: -2 });
  c.key('forearm_near', { 0: -4, 0.8: 2 });
  c.key('upper_arm_far', { 0: -2, 0.8: 2 });
  c.key('forearm_far', { 0: 2, 0.8: -3 });
  return c;
}

function run(dials: Dials): Motion {
  const c = new Motion('run', 0.6);
  c.bakeFps = 15;
  c.wind = [dials.runWind, 0];
  c.airborne = true;
  c.gait('thigh_near', 'shin_near', 'foot_near', dials.stride, 40, 0, GROUND_Y, 6, 0.4);
  c.gait('thigh_far', 'shin_far', 'foot_far', dials.stride, 40, 0.5, GROUND_Y, -6, 0.4);
  c.key('root_y', { 0.05: 4, 0.2: -7, 0.35: 4, 0.5: -7 });
  c.key('spine', { 0: -14, 0.15: -17, 0.3: -14, 0.45: -17 });
  c.key('head', { 0: 3, 0.15: 5, 0.3: 3, 0.45: 5 });
  // Arms in antiphase with their own leg: the near foot is at its front
  // extreme at t=0, its back extreme at t=0.24 (contact 0.4 x 0.6s). The
  // FOREARM deltas are POSITIVE: the hand pumps in front of the elbow — a
  // negative bend trails the hand behind it and reads as a backwards arm.
  c.key('upper_arm_near', { 0: -32, 0.24: 32 });
  c.key('forearm_near', { 0: 55, 0.24: 78 });
  c.key('upper_arm_far', { 0: 32, 0.24: -32 });
  c.key('forearm_far', { 0: 78, 0.24: 55 });
  return c;
}

function jump(dials: Dials): Motion {
  const c = new Motion('jump', 1.2);
  c.bakeFps = 15;
  c.wind = [-400 + dials.runWind * 0.5, 0];
  c.airborne = true;
  c.key('root_y', {
    0: 0,
    0.15: 14,
    0.3: -34,
    0.45: -46,
    0.6: -20,
    0.72: 10,
    0.9: 2,
    1.05: 0,
  });
  c.plant('thigh_near', 'shin_near', 'foot_near', {
    0: [140, GROUND_Y, 90],
    0.15: [140, 296, 70],
    0.3: [136, 250, 55],
    0.45: [138, 236, 50],
    0.6: [142, 262, 70],
    0.72: [140, 296, 90],
    0.9: [140, GROUND_Y, 90],
  });
  c.plant('thigh_far', 'shin_far', 'foot_far', {
    0: [116, GROUND_Y, 88],
    0.15: [116, 296, 70],
    0.3: [114, 252, 55],
    0.45: [110, 240, 50],
    0.6: [112, 264, 70],
    0.72: [116, 296, 88],
    0.9: [116, GROUND_Y, 88],
  });
  c.key('spine', { 0: 0, 0.15: -10, 0.3: 6, 0.45: 4, 0.6: -4, 0.72: -8, 0.9: 0 });
  c.key('head', { 0: 0, 0.15: 6, 0.3: -4, 0.6: 2, 0.72: 5, 0.9: 0 });
  // The jump's arms: wind up BACK through the crouch (negative), swing
  // forward-up through the launch, reach in flight, settle for the landing.
  // Forearm bends stay POSITIVE — hand ahead of the elbow, as in the run.
  c.key('upper_arm_near', { 0: 5, 0.15: -35, 0.3: 55, 0.45: 80, 0.6: 40, 0.72: -10, 0.9: 5 });
  c.key('forearm_near', { 0: 10, 0.15: 25, 0.3: 45, 0.45: 40, 0.6: 28, 0.72: 15, 0.9: 10 });
  c.key('upper_arm_far', { 0: -5, 0.15: -42, 0.3: 40, 0.45: 62, 0.6: 28, 0.72: -15, 0.9: -5 });
  c.key('forearm_far', { 0: 10, 0.15: 20, 0.3: 40, 0.45: 35, 0.6: 22, 0.72: 10, 0.9: 10 });
  return c;
}
