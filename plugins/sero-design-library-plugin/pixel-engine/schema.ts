/**
 * The shape of a sprite project (spec §4, §5).
 *
 * These types are both the in-memory shape and the stored shape: a project is
 * plain JSON with grids as rows of characters, so `project.json` is the file on
 * disk, the payload a tool receives, and the thing a game runtime plays — with
 * no second representation to drift from the first.
 *
 * Everything here is data. The rules that make a project *valid* live in
 * `validate/`, and the rules that turn it into pixels live in `resolve.ts`.
 */

import type { GridRows } from './grid';

/** Bumped when compiled output changes. Recorded with every compile (spec §9). */
export const ENGINE_VERSION = '1.0.0';

/** Which family of semantic checks a project answers to (spec §8.2). */
export type ProjectKind = 'character' | 'item' | 'tile' | 'effect';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * One palette entry. Index 0 is transparent for life, so its `hex` is never
 * drawn and exists only to keep the array dense.
 */
export interface PaletteColour {
  hex: string;
  name?: string;
  /** What the colour is for — `skin`, `outline`, `metal`. Free text, used by the model. */
  role?: string;
}

/** An ordered shading run of one material, darkest first (spec §4). */
export interface Ramp {
  id: string;
  name?: string;
  /** Palette indexes in shading order. */
  indexes: number[];
}

export interface Palette {
  colours: PaletteColour[];
  ramps: Ramp[];
}

/** An alternative drawing of a part, for a pose placement cannot express (P4). */
export interface PartVariant {
  id: string;
  name?: string;
  /** Same size as the part it belongs to. */
  rows: GridRows;
}

/**
 * A reusable piece of artwork cut from the base pose (spec §7.4).
 *
 * `origin` and `size` are the window it was cut from, so a placement of (0, 0)
 * puts the part back exactly where it came from. Joints overlap by design: parts
 * cut edge to edge open a transparent seam the moment anything moves (P5).
 */
export interface Part {
  id: string;
  name: string;
  origin: Point;
  size: Size;
  /** Canvas coordinates, used for alignment and by the editor. */
  pivot: Point;
  rows: GridRows;
  variants: PartVariant[];
}

/** A part, an integer offset from where it was cut, and an optional mirror. */
export interface Placement {
  partId: string;
  /** Which drawing of the part to place. Omitted means the part's own pixels. */
  variantId?: string;
  dx: number;
  dy: number;
  flipX?: boolean;
}

/** A single-cell override. `index` 0 erases. */
export interface Cell {
  x: number;
  y: number;
  index: number;
}

/**
 * One moment's pixels (spec §4).
 *
 * The four layers are applied in this order and locks are always last, which is
 * what makes the user's pixels win (P9):
 *
 * 1. `rows` — a whole grid, for the base pose or a hand-drawn frame.
 * 2. `placements` — parts, in array order, later placements drawn on top.
 * 3. `patch` — what placement cannot express.
 * 4. `locks` — cells the user drew by hand.
 */
export interface Frame {
  id: string;
  name?: string;
  rows?: GridRows;
  placements: Placement[];
  patch: Cell[];
  locks: Cell[];
}

export type LoopMode = 'loop' | 'once' | 'ping-pong';

export interface ClipFrame {
  frameId: string;
  durationMs: number;
}

export interface Clip {
  id: string;
  name: string;
  frames: ClipFrame[];
  loop: LoopMode;
  /**
   * How far the silhouette box may move between frames, in pixels. The drift
   * check measures against this, so a bounding walk declares a bigger budget
   * than an idle breath rather than switching the check off.
   */
  motionBudgetPx: number;
}

export interface PixelProject {
  id: string;
  name: string;
  kind: ProjectKind;
  /** The version of the engine that last wrote this project. */
  engineVersion: string;
  canvas: Size;
  pivot: Point;
  palette: Palette;
  parts: Part[];
  frames: Frame[];
  clips: Clip[];
  /**
   * True when the artwork is meant to be in more than one piece — a thrown
   * weapon, a spark, a floating shield. It turns off the silhouette-continuity
   * check, which would otherwise be right about the pixels and wrong about the art.
   */
  detachedParts?: boolean;
}

/** Caps that keep a run affordable and a canvas sane (spec §13). */
export const MIN_FRAME_DURATION_MS = 10;
export const MAX_FRAME_DURATION_MS = 10_000;
export const MAX_FRAMES_PER_CLIP = 64;
export const MAX_CANVAS_SIDE = 512;

/** How much of a placed part must land on the canvas before it counts as lost. */
export const MIN_PLACEMENT_ON_CANVAS = 0.5;

export function findPart(project: PixelProject, partId: string): Part | undefined {
  return project.parts.find((part) => part.id === partId);
}

export function findFrame(project: PixelProject, frameId: string): Frame | undefined {
  return project.frames.find((frame) => frame.id === frameId);
}

export function findClip(project: PixelProject, clipId: string): Clip | undefined {
  return project.clips.find((clip) => clip.id === clipId);
}

/** The rows a placement draws: the variant's if it names one, the part's otherwise. */
export function placementRows(part: Part, placement: Placement): GridRows | undefined {
  if (placement.variantId === undefined) return part.rows;
  return part.variants.find((variant) => variant.id === placement.variantId)?.rows;
}

export function isInsideCanvas(canvas: Size, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < canvas.width && y < canvas.height;
}
