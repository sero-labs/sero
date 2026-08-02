/**
 * Turning a picture and a set of joints into a rig.
 *
 * Phase 1c of the Ink & Bones plan. The authoring loop is no longer asked to
 * DRAW the character — it could not — so the character's own pixels are cut
 * into pieces and bound to bones. Everything downstream is unchanged: the
 * compositor rotates each piece by its bone at 4x, the grade quantises to the
 * piece's ramp and lays the ink outline, the audit gates run as before.
 *
 * Two ideas carry the whole file.
 *
 * **The cut is nearest-bone.** Every opaque cell of the canonical target goes
 * to the bone SEGMENT it is nearest to — a straight point-to-line-segment
 * distance in the target's own coordinates. Nothing is resampled, moved or
 * redrawn, so the pieces are the reference's pixels exactly where they were.
 * A cell close to two segments is given to BOTH: at rest they stamp the same
 * real pixels, so the picture is unchanged, and when a limb swings the shared
 * band is what stops a hole opening at the joint.
 *
 * **A part is painted through a paint bone.** A part's canvas is in bone-local
 * space with +Y along the bone, so pixels stamped onto a bone that rests at,
 * say, 200 degrees arrive rotated by 200 degrees. Rather than pre-rotate the
 * artwork — two resamplings of pixel art, for nothing — every bone that
 * carries artwork gets a child whose rest angle is the NEGATIVE of its
 * parent's world angle. That child's frame is therefore square to the canvas
 * at rest, so a stamp lands exactly where it was cut, and it still inherits
 * every later rotation of its parent. The anatomical bone keeps its true
 * angle and length, so IK and motion curves stay meaningful.
 */

import type { CellGrid } from '../../engine/types';
import { TRANSPARENT } from '../../engine/types';

/**
 * Supersampled px per TARGET CELL, when the target is the sprite's own grid.
 *
 * The high-resolution path hands over a target already at the compositor's
 * working resolution, and then a cell IS a supersampled pixel — so it passes 1.
 * Nothing else in the cut cares: distances, capsules and the seam allowance are
 * all measured in the target's own cells whatever those cells are.
 */
export const SS = 4;

/** Suffix of the square-to-canvas child every artwork-carrying bone gets. */
export const PAINT_SUFFIX = '_art';

export interface Joint {
  x: number;
  y: number;
}

export interface RigJoints {
  canvasW: number;
  canvasH: number;
  joints: Record<string, Joint>;
}

/** A bone as a pair of named joints. `parent` is '' for the root. */
export interface BoneSpec {
  name: string;
  parent: string;
  from: string;
  to: string;
  /**
   * How far from its own segment this bone may claim cells, as a half-width at
   * each end — a tapered capsule, the same shape the engine's `capsule` paints.
   *
   * A bone WITHOUT one is a body bone: it competes on distance alone and the
   * nearest wins. A bone WITH one is a prop, and it is the answer to the two
   * ways nearest-bone fails on carried things. A sword's bone runs diagonally
   * ACROSS the character's own hip, so on distance alone the blade's bone wins
   * a wedge of skirt and the skirt flies off with the swing. A shield's bone is
   * a stub between wrist and grip, so on distance alone the shield is torn
   * between the far arm and the far thigh. A capsule states the thing's real
   * extent, and inside it the prop takes precedence over every body bone.
   */
  capsule?: { r0: number; r1: number };
}

/**
 * The standard side-on humanoid, in draw order: far side first, body, near
 * side, then whatever is held. A bone whose joints the rig does not name is
 * skipped, so a character with no shield simply has no shield bone.
 *
 * Props are bones like any other — a sword is `wristNear -> gripMain`, a
 * shield `shieldTop -> shieldFoot`. That matters for the cut: a bone segment
 * has to SPAN the thing it owns, or the nearest-bone rule hands a big flat
 * shield to whichever limb happens to pass behind it.
 */
export const HUMANOID_BONES: readonly BoneSpec[] = [
  { name: 'spine', parent: '', from: 'pelvis', to: 'neck' },
  { name: 'legFarUpper', parent: 'spine', from: 'hipFar', to: 'kneeFar' },
  { name: 'legFarLower', parent: 'legFarUpper', from: 'kneeFar', to: 'ankleFar' },
  { name: 'footFar', parent: 'legFarLower', from: 'ankleFar', to: 'toeFar' },
  { name: 'armFarUpper', parent: 'spine', from: 'shoulderFar', to: 'elbowFar' },
  { name: 'armFarLower', parent: 'armFarUpper', from: 'elbowFar', to: 'wristFar' },
  { name: 'shield', parent: 'armFarLower', from: 'shieldTop', to: 'shieldFoot', capsule: { r0: 11, r1: 4 } },
  { name: 'head', parent: 'spine', from: 'neck', to: 'crown' },
  { name: 'legNearUpper', parent: 'spine', from: 'hipNear', to: 'kneeNear' },
  { name: 'legNearLower', parent: 'legNearUpper', from: 'kneeNear', to: 'ankleNear' },
  { name: 'footNear', parent: 'legNearLower', from: 'ankleNear', to: 'toeNear' },
  // Drawn after both thighs because a skirt hangs in front of them, and it
  // needs a bone at all because otherwise the two thighs split it down the
  // middle and a walk cycle tears the front panel in half.
  { name: 'hips', parent: 'spine', from: 'pelvis', to: 'skirtFoot' },
  { name: 'armNearUpper', parent: 'spine', from: 'shoulderNear', to: 'elbowNear' },
  { name: 'armNearLower', parent: 'armNearUpper', from: 'elbowNear', to: 'wristNear' },
  { name: 'sword', parent: 'armNearLower', from: 'wristNear', to: 'gripMain', capsule: { r0: 5, r1: 3 } },
];

export interface RigBone {
  name: string;
  parent: string;
  /** Parent-local, supersampled px — what `Skeleton.bone` wants. */
  pivot: [number, number];
  /** Degrees relative to the parent. */
  restDeg: number;
  /** Supersampled px. */
  length: number;
  /** Absolute rest angle, degrees — what the paint bone cancels. */
  worldDeg: number;
  /** The joint, in 1x canvas px. */
  origin: [number, number];
  /** Where the segment ends, 1x canvas px — the cut measures against this. */
  tip: [number, number];
  /** A prop's own extent; absent on body bones. */
  capsule?: { r0: number; r1: number };
}

export interface RigPiece {
  name: string;
  /** The paint bone this piece stamps onto. */
  bone: string;
  /** Where the piece sits on the canvas, 1x px. */
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** `w * h` palette indices, TRANSPARENT where the piece is not drawn. */
  cells: Int16Array;
  /** The palette indices this piece uses — the part's ramp. */
  ramp: number[];
  /** How many cells it owns outright, and how many it shares with a neighbour. */
  own: number;
  shared: number;
}

export interface Rig {
  bones: RigBone[];
  pieces: RigPiece[];
  /** Pelvis, in supersampled px — the skeleton's root. */
  rootPos: [number, number];
  /** Joints the bone list wanted and the rig did not name. */
  missing: string[];
  /** Opaque cells no bone claimed, which should always be zero. */
  orphans: number;
  /** One bone index per target cell, -1 where nothing is drawn. The cut's own
   * record of who owns what, which the strain gate measures against. */
  owner: Int32Array;
  /** Supersampled px per target cell, carried so the emitter cannot disagree
   * with the cut about what a coordinate means. */
  unit: number;
}

const degOf = (dx: number, dy: number): number => (Math.atan2(dx, dy) * 180) / Math.PI;

/** Distance from a point to a bone's segment, and how far along it fell. */
function toSegment(px: number, py: number, bone: RigBone): { d: number; t: number } {
  const dx = bone.tip[0] - bone.origin[0];
  const dy = bone.tip[1] - bone.origin[1];
  const l2 = dx * dx + dy * dy;
  const t =
    l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - bone.origin[0]) * dx + (py - bone.origin[1]) * dy) / l2));
  return { d: Math.hypot(px - (bone.origin[0] + dx * t), py - (bone.origin[1] + dy * t)), t };
}

/**
 * Build the bone chain.
 *
 * The angle convention is the engine's: 0 points screen-DOWN and positive
 * swings the tip EAST, so a bone from A to B rests at `atan2(dx, dy)`. Its
 * declared rest is that minus its parent's world angle, and its pivot is the
 * offset to its parent expressed in the PARENT's frame — both tracked while
 * walking down the list, which is why the list is parents-first.
 */
export function buildBones(
  rig: RigJoints,
  specs: readonly BoneSpec[] = HUMANOID_BONES,
  unit: number = SS,
): {
  bones: RigBone[];
  rootPos: [number, number];
  missing: string[];
} {
  const bones: RigBone[] = [];
  const byName = new Map<string, RigBone>();
  const missing: string[] = [];
  const root = rig.joints[specs[0]?.from ?? ''];
  const rootPos: [number, number] = root === undefined ? [0, 0] : [root.x * unit, root.y * unit];

  for (const spec of specs) {
    const from = rig.joints[spec.from];
    const to = rig.joints[spec.to];
    if (from === undefined || to === undefined) {
      missing.push(`${spec.name} (${spec.from} -> ${spec.to})`);
      continue;
    }
    const parent = spec.parent === '' ? undefined : byName.get(spec.parent);
    if (spec.parent !== '' && parent === undefined) {
      missing.push(`${spec.name} (its parent '${spec.parent}' was skipped)`);
      continue;
    }
    const worldDeg = degOf(to.x - from.x, to.y - from.y);
    const parentWorld = parent?.worldDeg ?? 0;
    const parentOrigin = parent === undefined ? rootPos : [parent.origin[0] * unit, parent.origin[1] * unit];
    const dx = from.x * unit - parentOrigin[0];
    const dy = from.y * unit - parentOrigin[1];
    // The offset seen from the parent: rotate it back by the parent's angle.
    // `fromRot(deg)` rotates by MINUS deg (the engine's convention), so undoing
    // it rotates by PLUS deg. Getting this sign wrong displaces every piece
    // below the joint, which is exactly what the bind-pose gate is for.
    const r = (parentWorld * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    const bone: RigBone = {
      name: spec.name,
      parent: spec.parent,
      pivot: [cos * dx - sin * dy, sin * dx + cos * dy],
      restDeg: worldDeg - parentWorld,
      length: Math.hypot(to.x - from.x, to.y - from.y) * unit,
      worldDeg,
      origin: [from.x, from.y],
      tip: [to.x, to.y],
      ...(spec.capsule === undefined ? {} : { capsule: spec.capsule }),
    };
    bones.push(bone);
    byName.set(spec.name, bone);
  }
  return { bones, rootPos, missing };
}

export interface CutOptions {
  /**
   * How far around a joint a parent reaches UNDER its child, in 1x cells.
   *
   * The seam allowance, and it is deliberately narrow and one-way. A cell is
   * owned by exactly one bone; near a joint, the CHILD's cells are copied onto
   * the PARENT as well. Because the parent is drawn first, the copy is hidden
   * at rest — the picture is unchanged — and when the child swings it is what
   * the wedge behind it lands on instead of bare canvas.
   *
   * The obvious alternative, giving a cell to every bone within a slack of the
   * nearest, was tried and is wrong: it duplicates whole boundaries far from
   * any joint (an arm against a torso, a near limb crossing a far one) and each
   * duplicate becomes a ghost that flies off on its own bone.
   */
  jointRadius: number;
  /** Supersampled px per target cell — 1 when the target is already at the
   * compositor's working resolution. */
  unit?: number;
}

export const DEFAULT_JOINT_RADIUS = 6;

/**
 * Cut the target into one piece per bone.
 *
 * Distances are measured in the target's own cell coordinates, and a piece
 * keeps its cells at those coordinates — the cut moves nothing, which is what
 * makes the rest pose reproduce the picture exactly.
 */
export function cutPieces(
  grid: CellGrid,
  bones: readonly RigBone[],
  options: CutOptions = { jointRadius: DEFAULT_JOINT_RADIUS },
): { pieces: RigPiece[]; orphans: number; owner: Int32Array } {
  const claims = bones.map(() => ({
    cells: new Map<number, number>(),
    x0: Infinity,
    y0: Infinity,
    x1: -Infinity,
    y1: -Infinity,
    own: 0,
    shared: 0,
  }));
  let orphans = 0;
  const owner = new Int32Array(grid.cols * grid.rows).fill(-1);

  const take = (b: number, index: number, cell: number, own: boolean): void => {
    const claim = claims[b];
    claim.cells.set(index, cell);
    if (own) claim.own++;
    else claim.shared++;
    const x = index % grid.cols;
    const y = Math.floor(index / grid.cols);
    if (x < claim.x0) claim.x0 = x;
    if (y < claim.y0) claim.y0 = y;
    if (x > claim.x1) claim.x1 = x;
    if (y > claim.y1) claim.y1 = y;
  };

  // How far the cell is from the body bone that would own it. Kept because the
  // props are grown against it below.
  const bodyDist = new Float64Array(grid.cols * grid.rows).fill(Infinity);
  const distances = new Float64Array(bones.length);
  const props: number[] = [];
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const index = y * grid.cols + x;
      const cell = grid.cells[index];
      if (cell === TRANSPARENT || cell < 0) continue;
      if (bones.length === 0) {
        orphans++;
        continue;
      }
      // A prop takes what falls inside its own outline, and nothing else looks
      // at that cell again — a blade crossing a hip belongs to the blade.
      let prop = -1;
      let nearest = -1;
      for (let b = 0; b < bones.length; b++) {
        const bone = bones[b];
        const { d, t } = toSegment(x + 0.5, y + 0.5, bone);
        distances[b] = d;
        if (bone.capsule !== undefined) {
          if (d <= bone.capsule.r0 + (bone.capsule.r1 - bone.capsule.r0) * t) prop = b;
          continue;
        }
        if (nearest < 0 || d < distances[nearest]) nearest = b;
      }
      if (nearest >= 0) bodyDist[index] = distances[nearest];
      if (prop >= 0) {
        owner[index] = prop;
        props.push(index);
        continue;
      }
      if (nearest < 0) {
        orphans++;
        continue;
      }
      owner[index] = nearest;
    }
  }

  // Grow each prop outward while it is still the better answer.
  //
  // A capsule is a straight line with a width, and a drawn thing is not: a
  // blade's dark outline and its widening ribs sit just outside the capsule
  // that holds the blade. Left there, they go to whichever body bone is
  // nearest — and near a sword tip held out to the side, that was the far FOOT,
  // thirty cells away, which then flew off across the canvas with every step.
  // So a cell touching a prop joins it whenever the prop is nearer than the
  // body bone that would otherwise own it. Nothing is claimed that the body
  // has a better claim to, which is why this needs no distance of its own.
  for (let head = 0; head < props.length; head++) {
    const index = props[head];
    const bone = bones[owner[index]];
    const x = index % grid.cols;
    const y = Math.floor(index / grid.cols);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
      const at = ny * grid.cols + nx;
      const cell = grid.cells[at];
      if (cell === TRANSPARENT || cell < 0) continue;
      if (owner[at] < 0 || bones[owner[at]].capsule !== undefined) continue;
      if (toSegment(nx + 0.5, ny + 0.5, bone).d >= bodyDist[at]) continue;
      owner[at] = owner[index];
      props.push(at);
    }
  }

  for (let index = 0; index < owner.length; index++) {
    if (owner[index] >= 0) take(owner[index], index, grid.cells[index], true);
  }

  // The seam allowance, one joint at a time: what the child owns near the
  // joint, the parent gets a hidden copy of. Props are left out — they never
  // swing against their parent, so a copy of a blade on a forearm could only
  // ever appear as a ghost.
  const indexOf = new Map(bones.map((bone, b) => [bone.name, b]));
  for (let c = 0; c < bones.length; c++) {
    const child = bones[c];
    const p = indexOf.get(child.parent);
    if (child.capsule !== undefined || p === undefined || bones[p].capsule !== undefined) continue;
    const [jx, jy] = child.origin;
    const x0 = Math.max(0, Math.floor(jx - options.jointRadius));
    const x1 = Math.min(grid.cols - 1, Math.ceil(jx + options.jointRadius));
    const y0 = Math.max(0, Math.floor(jy - options.jointRadius));
    const y1 = Math.min(grid.rows - 1, Math.ceil(jy + options.jointRadius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const index = y * grid.cols + x;
        if (owner[index] !== c) continue;
        if (Math.hypot(x + 0.5 - jx, y + 0.5 - jy) > options.jointRadius) continue;
        take(p, index, grid.cells[index], false);
      }
    }
  }

  const pieces: RigPiece[] = [];
  for (let b = 0; b < bones.length; b++) {
    const claim = claims[b];
    if (claim.cells.size === 0) continue;
    const w = claim.x1 - claim.x0 + 1;
    const h = claim.y1 - claim.y0 + 1;
    const cells = new Int16Array(w * h).fill(TRANSPARENT);
    const ramp = new Set<number>();
    for (const [index, value] of claim.cells) {
      const x = (index % grid.cols) - claim.x0;
      const y = Math.floor(index / grid.cols) - claim.y0;
      cells[y * w + x] = value;
      ramp.add(value);
    }
    pieces.push({
      name: bones[b].name,
      bone: bones[b].name + PAINT_SUFFIX,
      x0: claim.x0,
      y0: claim.y0,
      w,
      h,
      cells,
      ramp: [...ramp].sort((p, q) => p - q),
      own: claim.own,
      shared: claim.shared,
    });
  }
  return { pieces, orphans, owner };
}

/** Bones and pieces together — the whole rig, still plain data. */
export function buildRig(
  grid: CellGrid,
  rig: RigJoints,
  specs: readonly BoneSpec[] = HUMANOID_BONES,
  options: CutOptions = { jointRadius: DEFAULT_JOINT_RADIUS },
): Rig {
  const unit = options.unit ?? SS;
  const { bones, rootPos, missing } = buildBones(rig, specs, unit);
  const { pieces, orphans, owner } = cutPieces(grid, bones, options);
  return { bones, pieces, rootPos, missing, orphans, owner, unit };
}
