/**
 * The sheet's companion data, in Aseprite's JSON shape (spec §9).
 *
 * Aseprite's array format was chosen because Godot, Unity, Phaser and LÖVE all
 * already import it, which is the difference between an export a user can use
 * and one they have to write a loader for. Clips become `frameTags`; the pivot
 * becomes a slice, which is where those importers look for an origin.
 *
 * The atlas describes what the packer produced. It never measures the artwork
 * itself, so a sheet and its atlas cannot disagree.
 */

import type { PackedSheet } from './pack';
import { ENGINE_VERSION, type LoopMode, type PixelProject } from './schema';

export interface AtlasBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasFrame {
  filename: string;
  frame: AtlasBox;
  rotated: false;
  trimmed: false;
  spriteSourceSize: AtlasBox;
  sourceSize: { w: number; h: number };
  duration: number;
}

/** Aseprite's three directions. A clip that plays once is still a forward clip. */
export type AtlasDirection = 'forward' | 'reverse' | 'pingpong';

export interface AtlasTag {
  name: string;
  from: number;
  to: number;
  direction: AtlasDirection;
}

export interface Atlas {
  frames: AtlasFrame[];
  meta: {
    app: string;
    version: string;
    image: string;
    format: 'RGBA8888';
    size: { w: number; h: number };
    scale: string;
    frameTags: AtlasTag[];
    slices: { name: string; color: string; keys: { frame: number; bounds: AtlasBox; pivot: { x: number; y: number } }[] }[];
  };
}

/** One packed row: the clip it came from, and how long each of its frames lasts. */
export interface AtlasRow {
  name: string;
  loop: LoopMode;
  durations: number[];
}

export interface AtlasOptions {
  /** The file name of the sheet this atlas describes. */
  image: string;
  /** The whole-number scale the sheet was rendered at. */
  scale?: number;
}

export const ATLAS_APP = 'https://sero.ai/pixel-engine';

export function buildAtlas(project: PixelProject, packed: PackedSheet, rows: readonly AtlasRow[], options: AtlasOptions): Atlas {
  const scale = options.scale ?? 1;
  if (!Number.isInteger(scale) || scale < 1) throw new Error(`scale ${scale} is not a whole number of pixels`);

  const frames: AtlasFrame[] = packed.frames.map((frame) => {
    // By index, never by name: two clips may share a name, and one of them may
    // even be called `base`. A lookup by name gives the wrong durations.
    const row = rows[frame.rowIndex];
    return {
      filename: `${project.name} ${frame.row} ${frame.index}.png`,
      frame: { x: frame.x * scale, y: frame.y * scale, w: frame.width * scale, h: frame.height * scale },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frame.width * scale, h: frame.height * scale },
      sourceSize: { w: frame.width * scale, h: frame.height * scale },
      duration: row?.durations[frame.index] ?? 100,
    };
  });

  let at = 0;
  const frameTags: AtlasTag[] = rows.map((row) => {
    const from = at;
    at += row.durations.length;
    return { name: row.name, from, to: Math.max(from, at - 1), direction: directionOf(row.loop) };
  });

  return {
    frames,
    meta: {
      app: ATLAS_APP,
      version: ENGINE_VERSION,
      image: options.image,
      format: 'RGBA8888',
      size: { w: packed.width * scale, h: packed.height * scale },
      scale: String(scale),
      frameTags,
      slices: [
        {
          name: 'pivot',
          color: '#0000ffff',
          keys: [
            {
              frame: 0,
              bounds: { x: 0, y: 0, w: project.canvas.width * scale, h: project.canvas.height * scale },
              pivot: { x: project.pivot.x * scale, y: project.pivot.y * scale },
            },
          ],
        },
      ],
    },
  };
}

function directionOf(loop: LoopMode): AtlasDirection {
  return loop === 'ping-pong' ? 'pingpong' : 'forward';
}

/** The atlas as the bytes that go in the file: stable key order, one trailing newline. */
export function atlasJson(atlas: Atlas): string {
  return `${JSON.stringify(atlas, null, 2)}\n`;
}
