/**
 * The project every engine test compiles.
 *
 * A 12×16 character with a coiled whip, rigged the way the spec says a rig must
 * be built: joints overlap by two rows, and the prop is its own part (P5). It is
 * deliberately small — a golden PNG stays a few hundred bytes and a failing
 * assertion is readable as text — while still exercising every rule, because it
 * has parts that overlap, a prop that must not swing with a leg, a shading ramp,
 * and a walk built only from placements.
 *
 * Each call returns a fresh project. Tests mutate their copies freely.
 */

import type { PixelProject, ProjectKind } from '../schema';
import { ENGINE_VERSION } from '../schema';
import type { GridRows } from '../grid';

/** The base pose, drawn once. Everything else in this file is cut from it. */
const BASE_POSE = [
  '000000000000',
  '000111111000',
  '000122221000',
  '000121121000',
  '000122221000',
  '000111111000',
  '001344443100',
  '001344443100',
  '001344443150',
  '001333333150',
  '001344443155',
  '000131131050',
  '000131131050',
  '000131131000',
  '000111111000',
  '000000000000',
];

/** A window on the base pose — how a real rig is cut (spec §7.4). */
function cut(x: number, y: number, width: number, height: number): GridRows {
  return Array.from({ length: height }, (_, row) => (BASE_POSE[y + row] ?? '').slice(x, x + width).padEnd(width, '0'));
}

export function knightProject(): PixelProject {
  return {
    id: 'knight',
    name: 'Knight',
    kind: 'character',
    engineVersion: ENGINE_VERSION,
    canvas: { width: 12, height: 16 },
    pivot: { x: 6, y: 15 },
    palette: {
      colours: [
        { hex: '#000000', name: 'transparent' },
        { hex: '#1a1a24', name: 'outline', role: 'outline' },
        { hex: '#e8b58a', name: 'skin', role: 'skin' },
        { hex: '#2a4c6d', name: 'tunic shadow', role: 'cloth' },
        { hex: '#3f76a8', name: 'tunic', role: 'cloth' },
        { hex: '#8a5a2b', name: 'leather', role: 'prop' },
      ],
      ramps: [{ id: 'cloth', name: 'Tunic', indexes: [3, 4] }],
    },
    // Joints overlap by two rows: the head reaches into the body's first rows and
    // the legs reach into the body's last rows, so a one-pixel bob cannot open a
    // transparent seam across the shoulders or the hips (P5).
    parts: [
      { id: 'head', name: 'Head', origin: { x: 0, y: 0 }, size: { width: 12, height: 7 }, pivot: { x: 6, y: 5 }, rows: cut(0, 0, 12, 7), variants: [] },
      { id: 'body', name: 'Body', origin: { x: 0, y: 5 }, size: { width: 12, height: 7 }, pivot: { x: 6, y: 9 }, rows: cut(0, 5, 12, 7), variants: [] },
      { id: 'legL', name: 'Left leg', origin: { x: 3, y: 9 }, size: { width: 3, height: 7 }, pivot: { x: 4, y: 11 }, rows: cut(3, 9, 3, 7), variants: [] },
      { id: 'legR', name: 'Right leg', origin: { x: 6, y: 9 }, size: { width: 3, height: 7 }, pivot: { x: 7, y: 11 }, rows: cut(6, 9, 3, 7), variants: [] },
      // The whip hangs from the belt and belongs to the body. Left inside the
      // leg's cut it swung with every step, and the drift check reported the
      // silhouette widening by 4px (P5).
      { id: 'whip', name: 'Whip', origin: { x: 10, y: 7 }, size: { width: 2, height: 6 }, pivot: { x: 10, y: 9 }, rows: cut(10, 7, 2, 6), variants: [] },
    ],
    frames: [
      frame('base', 0, 0, 0),
      // A four-frame walk: contact, passing, contact with the legs swapped,
      // passing. Nothing is redrawn — the legs step and the body bobs (P4).
      frame('walk-0', 1, -1, 0),
      frame('walk-1', 0, 0, 1),
      frame('walk-2', -1, 1, 0),
      frame('walk-3', 0, 0, 1),
    ],
    clips: [
      {
        id: 'walk',
        name: 'Walk',
        loop: 'loop',
        motionBudgetPx: 3,
        frames: [
          { frameId: 'walk-0', durationMs: 120 },
          { frameId: 'walk-1', durationMs: 120 },
          { frameId: 'walk-2', durationMs: 120 },
          { frameId: 'walk-3', durationMs: 120 },
        ],
      },
    ],
  };
}

/**
 * One walk frame as placements only.
 *
 * Draw order is the placement order and the upper part goes last, so the seam at
 * every joint is covered by real pixels rather than by luck.
 */
function frame(id: string, frontLeg: number, backLeg: number, bob: number) {
  return {
    id,
    placements: [
      { partId: 'legR', dx: backLeg, dy: 0 },
      { partId: 'legL', dx: frontLeg, dy: 0 },
      { partId: 'whip', dx: 0, dy: -bob },
      { partId: 'body', dx: 0, dy: -bob },
      { partId: 'head', dx: 0, dy: -bob },
    ],
    patch: [],
    locks: [],
  };
}

/** The base pose as text, for tests that assert resolution reproduces it exactly. */
export const KNIGHT_BASE_POSE: GridRows = BASE_POSE;

/**
 * A one-frame project drawn as text — no rig, no clips.
 *
 * The kind checks, the renderer and the packer all need artwork rather than a
 * rig, and reading the fixture as a picture in the test is the point: a tile
 * that does not wrap is visible in the source of the test that says so.
 */
export function drawnProject(kind: ProjectKind, rows: GridRows, name = 'Drawn'): PixelProject {
  const width = rows[0]?.length ?? 0;
  const height = rows.length;
  return {
    id: `drawn-${kind}`,
    name,
    kind,
    engineVersion: ENGINE_VERSION,
    canvas: { width, height },
    pivot: { x: Math.floor(width / 2), y: Math.max(0, height - 1) },
    palette: {
      colours: [
        { hex: '#000000', name: 'transparent' },
        { hex: '#1a1a24', name: 'outline', role: 'outline' },
        { hex: '#c0a062', name: 'gold', role: 'metal' },
        { hex: '#7a6234', name: 'gold shadow', role: 'metal' },
      ],
      ramps: [{ id: 'metal', name: 'Gold', indexes: [3, 2] }],
    },
    parts: [],
    frames: [{ id: 'only', rows, placements: [], patch: [], locks: [] }],
    clips: [],
  };
}
