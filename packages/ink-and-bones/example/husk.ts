/**
 * A reference puppet — "Husk", a shambling revenant.
 *
 * The others in the cast are upright, symmetric and balanced, because that is
 * what a rig does by default. Husk exists for the axis none of them tests: a
 * body that is WRONG on purpose. A zombie is none of those three things, and
 * every deviation from the default has to be authored:
 *
 *  - **A hunched, off-vertical stack.** The spine leans east, the chest curls
 *    back over it and the head lolls forward past both. The rest angles carry
 *    that identity, so every clip inherits the slouch for free and no curve
 *    has to hold the pose up.
 *  - **Both arms reaching, at different heights.** Scout's and Rivet's arms
 *    hang; these are keyed out east from the shoulder — which is what the
 *    silhouette is recognised by before any colour lands.
 *  - **A limp.** The two legs run the same gait at the same stride, and only
 *    the LIFT differs: 16 ss on the near foot, 4 on the far one, which drags.
 *    Stride asymmetry would walk the character sideways and the in-place gate
 *    would catch it; lift asymmetry is the honest way to author a limp.
 *  - **A gravity chain.** The scarf streams on wind, the antenna stands on
 *    stiffness — the coat tail does neither. Heavy, slack, barely windblown:
 *    it hangs off the hips and is swung about by the body under it.
 *
 * Canvas 64 x 80 at 1x; all skeleton and paint coordinates are supersampled px
 * (4x). The ankles plant at y = 288 ss; groundRow is measured from the rest
 * bake, not guessed.
 */

import type { CharacterSpec, Color, Part, Pose, Vec } from '../src/index';
import { Motion, Paint, Skeleton, hex } from '../src/index';

export const CANVAS_W = 64;
export const CANVAS_H = 80;
/** Where the ankles plant, ss. */
const GROUND_Y = 288;
/** Measured from the rest bake (stats().feet): the sole plus its ink outline. */
const GROUND_ROW = 73;

// --- palette ---------------------------------------------------------------

export interface Rot {
  fleshLight: Color;
  flesh: Color;
  fleshDark: Color;
  ragLight: Color;
  rag: Color;
  ragDark: Color;
}

/** The default look; retheme = pass different hexes and rebake. */
export const GRAVE: Rot = {
  fleshLight: hex('a9c184'),
  flesh: hex('7c9455'),
  fleshDark: hex('4a5c33'),
  ragLight: hex('9b93a4'),
  rag: hex('6b6474'),
  ragDark: hex('403c4c'),
};

export const DROWNED: Rot = {
  fleshLight: hex('9fbcc4'),
  flesh: hex('63868f'),
  fleshDark: hex('3a505a'),
  ragLight: hex('8d9a86'),
  rag: hex('5c6857'),
  ragDark: hex('353d34'),
};

const INK = hex('15111c');
const BONE_LIGHT = hex('efe6c8');
const BONE = hex('c9bd98');
const GORE = hex('7b2331');
const EYE = hex('f7ef7a');
const EYE_CORE = hex('fffce4');
const SHADOW: Color = [0.03, 0.05, 0.03, 0.45];

// --- dials the demo UI exposes ---------------------------------------------

export interface Dials {
  /** Shamble stride, ss px. A dead thing does not take long steps. */
  stride: number;
  /** How hard the coat tail is dragged west, ss px/s^2. Small next to its
   * gravity on purpose: this chain hangs, it does not stream. */
  drag: number;
}

export const DEFAULT_DIALS: Dials = { stride: 40, drag: -260 };

// --- the puppet ------------------------------------------------------------

export function buildCharacter(rot: Rot = GRAVE, dials: Dials = DEFAULT_DIALS): CharacterSpec {
  const S = new Skeleton();
  // Pelvis at 192 with the ankles at 288 uses 96 of a 104 leg reach: stiff,
  // near-locked knees with 8 ss of flex left, which is what makes the walk
  // read as a shamble instead of a stroll.
  S.rootPos = [98, 192];
  S.bone('pelvis', '', [0, 0], 0, 0);
  S.bone('thigh_near', 'pelvis', [10, 4], 0, 52);
  S.bone('shin_near', 'thigh_near', S.tip(), 0, 52);
  S.bone('foot_near', 'shin_near', S.tip(), 90, 14);
  S.bone('thigh_far', 'pelvis', [-10, 6], 0, 52);
  S.bone('shin_far', 'thigh_far', S.tip(), 0, 52);
  S.bone('foot_far', 'shin_far', S.tip(), 90, 14);
  // The slouch, carried by the REST angles: spine east of vertical, chest
  // curling back over it, head lolling forward past both. Upward bones, so a
  // rest under 180 leans the tip east.
  S.bone('spine', 'pelvis', [0, -4], 164, 44);
  S.bone('chest', 'spine', S.tip(), 8, 42);
  S.bone('head', 'chest', S.tip(), -14, 54);
  // Arms out east. The shoulder's parent points up, so a local -78 puts the
  // upper arm at world 96 — horizontal, a hair below level.
  S.bone('upper_arm_near', 'chest', [-5, 30], -78, 32);
  S.bone('forearm_near', 'upper_arm_near', S.tip(), -8, 28);
  S.bone('upper_arm_far', 'chest', [5, 27], -56, 32);
  S.bone('forearm_far', 'upper_arm_far', S.tip(), -14, 28);
  // The coat tail: the same verlet chain as the scarf, told to be a heavy
  // slack rag. Gravity dwarfs the wind (rest hang = atan(|wind| / gravity), a
  // few degrees off straight down), stiffness is near zero so nothing pins it
  // upright, and the long taper leaves the top links dead — it is swung by
  // the hips it hangs from, not blown. restDir is bone-local and the spine
  // points UP, so [0, -1] is straight down the screen.
  S.chain('tail', 'spine', [10, 2], 7, 11, [dials.drag, 0], 2600, 0.972, 0.45, 0.06, [0, -1]);

  const flesh: Color[] = [rot.fleshLight, rot.flesh, rot.fleshDark];
  const rags: Color[] = [rot.ragLight, rot.rag, rot.ragDark];

  const parts: Part[] = [
    { name: 'upper_arm_far', bone: 'upper_arm_far', ramp: rags, paint: upperArm(rot, true) },
    { name: 'forearm_far', bone: 'forearm_far', ramp: [...rags, ...flesh], paint: forearm(rot, true) },
    { name: 'thigh_far', bone: 'thigh_far', ramp: rags, paint: thigh(rot, true) },
    { name: 'shin_far', bone: 'shin_far', ramp: [...rags, ...flesh], paint: shin(rot, true) },
    { name: 'foot_far', bone: 'foot_far', ramp: rags, paint: foot(rot, true) },
    { name: 'tail', chain: 'tail', ramp: rags, painter: tail(rot) },
    { name: 'hips', bone: 'spine', ramp: [...rags, ...flesh], paint: hips(rot) },
    { name: 'chest', bone: 'chest', ramp: [...rags, ...flesh, BONE, BONE_LIGHT, GORE], paint: chest(rot) },
    { name: 'head', bone: 'head', ramp: [...flesh, ...rags, BONE, BONE_LIGHT, GORE, EYE, EYE_CORE], paint: head(rot) },
    { name: 'thigh_near', bone: 'thigh_near', ramp: rags, paint: thigh(rot, false) },
    { name: 'shin_near', bone: 'shin_near', ramp: [...rags, ...flesh], paint: shin(rot, false) },
    { name: 'foot_near', bone: 'foot_near', ramp: rags, paint: foot(rot, false) },
    { name: 'upper_arm_near', bone: 'upper_arm_near', ramp: rags, paint: upperArm(rot, false) },
    { name: 'forearm_near', bone: 'forearm_near', ramp: [...rags, ...flesh, BONE], paint: forearm(rot, false) },
  ];

  const clips = new Map<string, Motion>();
  clips.set('idle', idle(dials));
  clips.set('shamble', shamble(dials));
  clips.set('lunge', lunge(dials));
  clips.set('shamble_west', Motion.mirror('shamble_west', 'shamble', clips.get('shamble')!));

  const restPose = (): Pose => {
    const pose: Pose = { deg: {} };
    S.solveChain(pose, 'thigh_near', 'shin_near', [116, GROUND_Y], 1, 'foot_near', 90);
    S.solveChain(pose, 'thigh_far', 'shin_far', [80, GROUND_Y], 1, 'foot_far', 86);
    return pose;
  };

  return {
    canvasW: CANVAS_W,
    canvasH: CANVAS_H,
    groundRow: GROUND_ROW,
    skeleton: S,
    parts,
    clips,
    grade: { ink: INK, shadow: SHADOW, emissiveLone: [EYE, EYE_CORE] },
    shadow: { x: 32, y: 77, rx: 14, ry: 2 },
    restPose,
  };
}

// --- paints (bone-local, +Y along the bone) --------------------------------

function thigh(rot: Rot, far: boolean): Paint {
  const p = new Paint({ x: -14, y: -6, w: 28, h: 64 });
  p.capsule([0, 2], [0, 50], 9, 7, far ? rot.ragDark : rot.rag);
  if (!far) {
    p.tintToward([-1, -0.4], rot.ragLight, 3);
    p.tintToward([1, 0.4], rot.ragDark, 3);
  }
  p.occludeAbove(6, 8, 0.25);
  return p;
}

function shin(rot: Rot, far: boolean): Paint {
  const p = new Paint({ x: -14, y: -6, w: 28, h: 64 });
  // Trouser to the knee, bare shin below it: the tear is what says the body
  // has been walking a long time, and it separates leg from leg by value.
  p.capsule([0, 0], [0, 20], 7.5, 6.5, far ? rot.ragDark : rot.rag);
  p.capsule([0, 18], [0, 46], 6.5, 5.5, far ? rot.fleshDark : rot.flesh);
  if (!far) {
    p.tintToward([-1, -0.4], rot.fleshLight, 2.5);
    p.tintToward([1, 0.5], rot.fleshDark, 2.5);
  }
  return p;
}

function foot(rot: Rot, far: boolean): Paint {
  // The foot bone points toe-ward (rest 90 = east): +Y = toe, -X = the sole.
  const p = new Paint({ x: -14, y: -10, w: 28, h: 32 });
  p.capsule([2, -3], [0, 12], 6, 4.5, far ? rot.ragDark : rot.rag);
  if (!far) p.tintToward([1, -0.3], rot.ragLight, 2);
  return p;
}

function hips(rot: Rot): Paint {
  // An upward bone: local +Y is up the screen, local +X is screen-WEST.
  const p = new Paint({ x: -22, y: -10, w: 44, h: 58 });
  p.capsule([0, 2], [1, 38], 11, 12, rot.rag);
  // The belt, hanging low and crooked, like everything else here.
  p.capsule([-9, 7], [9, 10], 3.5, 3.5, rot.ragDark);
  p.tintToward([0.8, 0.5], rot.ragLight, 3);
  p.tintToward([-0.7, -0.5], rot.ragDark, 3);
  return p;
}

function chest(rot: Rot): Paint {
  const p = new Paint({ x: -24, y: -8, w: 48, h: 56 });
  p.capsule([0, 0], [-2, 36], 12, 11, rot.rag);
  // The hole in the shirt, and two ribs standing in it — the one bright
  // shape on the body, on the face side (-X) where the eye already is.
  p.disc([-5, 20], 9, GORE);
  p.capsule([-12, 16], [-1, 15], 3, 3, BONE);
  p.capsule([-13, 23], [-2, 22], 3, 3, BONE_LIGHT);
  p.tintToward([0.7, 0.7], rot.ragLight, 3.5);
  p.tintToward([-0.5, -0.8], rot.ragDark, 3);
  p.occludeAbove(4, 8, 0.2);
  return p;
}

function head(rot: Rot): Paint {
  // An upward bone: local +X is screen-WEST, so the face looks toward -X.
  const p = new Paint({ x: -30, y: -6, w: 60, h: 62 });
  // A big skull with a jaw hanging off the front of it: the silhouette cue.
  // Drawn as a polygon because a slack jaw is a corner, not a curve.
  p.disc([2, 36], 18, rot.flesh);
  p.polygon(
    [
      [-14, 34],
      [-24, 30],
      [-27, 21],
      [-19, 17],
      [-9, 22],
    ],
    rot.fleshDark,
  );
  // The lank hair: over the crown and down the back of the skull, so the
  // head is not a circle in silhouette — the one shape cue up here.
  p.capsule([10, 48], [21, 24], 8, 5, rot.ragDark);
  // The brow, sunk over the socket.
  p.capsule([-16, 39], [-5, 41], 2.8, 2.8, rot.fleshDark);
  p.disc([-11, 33], 4.5, BONE_LIGHT); // the socket
  p.disc([-12, 33], 2.6, EYE); // the emissive: the gaze, always east
  p.disc([-13, 33], 1.2, EYE_CORE);
  p.capsule([-20, 25], [-11, 26], 1.8, 1.8, GORE); // the mouth line
  p.tintToward([0.6, 0.8], rot.fleshLight, 3.5);
  p.tintToward([-0.9, -0.5], rot.fleshDark, 3);
  return p;
}

function upperArm(rot: Rot, far: boolean): Paint {
  const p = new Paint({ x: -12, y: -6, w: 24, h: 44 });
  p.capsule([0, 0], [0, 32], 7, 5.5, far ? rot.ragDark : rot.rag);
  if (!far) p.tintToward([-1, -0.3], rot.ragLight, 2.5);
  p.occludeAbove(4, 7, 0.25);
  return p;
}

function forearm(rot: Rot, far: boolean): Paint {
  const p = new Paint({ x: -12, y: -6, w: 24, h: 46 });
  // Sleeve to the elbow, then bare arm, then the hand — three values down one
  // limb, so a reaching arm still reads when it crosses the chest.
  p.capsule([0, 0], [0, 12], 6, 5.5, far ? rot.ragDark : rot.rag);
  p.capsule([0, 11], [0, 24], 5.5, 4.5, far ? rot.fleshDark : rot.flesh);
  // The hand: a palm and two hooked fingers, so the grasp reads at the tip.
  p.disc([0, 27], 5.5, far ? rot.fleshDark : rot.flesh);
  p.capsule([-3, 28], [-4, 33], 3.4, 3, far ? rot.fleshDark : rot.fleshLight);
  p.capsule([2, 28], [3, 32], 3.4, 3, far ? rot.fleshDark : rot.flesh);
  if (!far) {
    p.tintToward([-1, -0.3], rot.fleshLight, 2);
    p.disc([0, 6], 3, BONE); // a splinter of bone through the sleeve
  }
  return p;
}

/** The coat tail: a wide rag torn to a point, painted along the simulated
 * links like the scarf. Half-widths stay well over the 2.5 ss floor or the
 * grade breaks the hem into speckle. */
function tail(rot: Rot): (p: Paint, pts: readonly Vec[]) => void {
  return (p: Paint, pts: readonly Vec[]) => {
    p.ribbon(pts, 11, 4, rot.rag);
    p.tintToward([-0.6, -1], rot.ragLight, 2.5);
    p.tintToward([0.6, 1], rot.ragDark, 3);
  };
}

// --- clips -----------------------------------------------------------------

function idle(dials: Dials): Motion {
  const c = new Motion('idle', 2.4);
  c.bakeFps = 12;
  c.wind = [dials.drag * 0.3, 0];
  c.plant('thigh_near', 'shin_near', 'foot_near', { 0: [116, GROUND_Y, 90] });
  c.plant('thigh_far', 'shin_far', 'foot_far', { 0: [80, GROUND_Y, 86] });
  // It does not breathe. It sways, and the head arrives late and goes further
  // than the body did — the lag is the whole read.
  c.key('root_y', { 0: 0, 1.2: 2 });
  c.key('spine', { 0: -1.5, 1.2: 1.5 });
  c.key('chest', { 0.2: 2, 1.4: -2 });
  c.key('head', { 0.5: -4, 1.7: 4 });
  c.key('upper_arm_near', { 0: 3, 1.2: -3 });
  c.key('forearm_near', { 0.3: -5, 1.5: 5 });
  c.key('upper_arm_far', { 0: -3, 1.2: 3 });
  c.key('forearm_far', { 0.3: 4, 1.5: -4 });
  return c;
}

function shamble(dials: Dials): Motion {
  const c = new Motion('shamble', 1.4);
  c.bakeFps = 12;
  c.wind = [dials.drag, 0];
  // Same stride and the same contact on both legs — anything else walks the
  // character sideways. The LIMP is the lift: 16 on the near foot, 4 on the
  // far one, which barely clears the floor and drags.
  c.gait('thigh_near', 'shin_near', 'foot_near', dials.stride, 16, 0, GROUND_Y, 18, 0.72);
  c.gait('thigh_far', 'shin_far', 'foot_far', dials.stride, 4, 0.5, GROUND_Y, -18, 0.72);
  // The body drops onto the good leg and is hauled off the bad one, so the
  // bob is once per stride rather than the usual twice.
  c.key('root_y', { 0: 4, 0.35: -2, 0.7: 4, 1.05: 1 });
  c.key('spine', { 0: -4, 0.7: 2 });
  c.key('chest', { 0: 3, 0.7: -3 });
  c.key('head', { 0.15: -5, 0.85: 5 });
  c.key('upper_arm_near', { 0: -6, 0.7: 6 });
  c.key('forearm_near', { 0: 5, 0.7: -5 });
  c.key('upper_arm_far', { 0: 5, 0.7: -5 });
  c.key('forearm_far', { 0: -6, 0.7: 6 });
  return c;
}

/**
 * A lunge: the one clip that does not loop.
 *
 * It is also the only clip that commits weight east, so it declares its own
 * wobble budget instead of being flattened to fit the default — and it drags
 * the coat tail with a keyed wind that snaps back, which is the one thing a
 * constant clip wind cannot do.
 */
function lunge(dials: Dials): Motion {
  const c = new Motion('lunge', 1.3, false);
  c.bakeFps = 15;
  c.wobbleBudget = 4;
  c.wind = [dials.drag, 0];
  // Dragged east by the body going that way, then let go: the rag catches up
  // after the pose has already stopped.
  c.key('wind_x', { 0: dials.drag, 0.3: -dials.drag * 4, 0.6: dials.drag, 1.3: dials.drag });
  c.plant('thigh_near', 'shin_near', 'foot_near', {
    0: [116, GROUND_Y, 90],
    0.18: [110, GROUND_Y, 90],
    0.42: [142, GROUND_Y, 96],
    0.9: [138, GROUND_Y, 94],
    1.3: [116, GROUND_Y, 90],
  });
  c.plant('thigh_far', 'shin_far', 'foot_far', {
    0: [80, GROUND_Y, 86],
    0.18: [76, GROUND_Y, 86],
    0.42: [82, GROUND_Y, 80],
    0.9: [82, GROUND_Y, 82],
    1.3: [80, GROUND_Y, 86],
  });
  // Gather back, throw the whole body east, hang there, then sag home.
  c.key('root_y', { 0: 0, 0.18: 4, 0.42: 8, 0.9: 6, 1.3: 0 }, 'outBack');
  c.key('spine', { 0: 0, 0.18: 5, 0.42: -12, 0.9: -9, 1.3: 0 }, 'outBack');
  c.key('chest', { 0: 0, 0.18: 4, 0.42: -8, 0.9: -6, 1.3: 0 });
  c.key('head', { 0: 0, 0.18: 6, 0.42: -10, 0.9: -7, 1.3: 0 });
  // The arms wind back a little and then reach past everything else.
  c.key('upper_arm_near', { 0: 0, 0.18: 10, 0.42: -22, 0.9: -18, 1.3: 0 });
  c.key('forearm_near', { 0: 0, 0.18: 6, 0.42: 12, 0.9: 9, 1.3: 0 });
  c.key('upper_arm_far', { 0: 0, 0.18: 8, 0.42: -16, 0.9: -13, 1.3: 0 });
  c.key('forearm_far', { 0: 0, 0.18: 5, 0.42: 14, 0.9: 11, 1.3: 0 });
  return c;
}
