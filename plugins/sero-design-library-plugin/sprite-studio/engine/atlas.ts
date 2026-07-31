/**
 * The atlas: Aseprite's JSON, unchanged (D16).
 *
 * Chosen because most engines and tools already read it, so the output is useful
 * without a loader being written first. `direction` carries `forward` and
 * `pingpong` as they stand, which is why a loop mode needed no new field.
 *
 * The anchor, the palette and the character id go in `meta.sero`: a game should
 * not have to be told where the character's feet are when the file already knows.
 */

import { toHex } from './colour';
import type { Sheet } from './sheet';
import type { Palette } from './types';

export interface AtlasFrame {
  filename: string;
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  duration: number;
}

export interface AtlasTag {
  name: string;
  from: number;
  to: number;
  direction: 'forward' | 'pingpong';
}

export interface Atlas {
  frames: AtlasFrame[];
  meta: {
    app: string;
    version: string;
    image: string;
    format: 'I8';
    size: { w: number; h: number };
    scale: string;
    frameTags: AtlasTag[];
    sero: {
      character: string;
      artHeight: number;
      /** Per animation, because the canvas is per animation (D13). */
      anchors: { animation: string; x: number; y: number }[];
      palette: string[];
      /** An animation that plays once carries no tag direction, so it is named here. */
      once: string[];
    };
  };
}

export const ATLAS_APP = 'sero-sprite-studio';

export function buildAtlas(
  sheet: Sheet,
  options: {
    image: string;
    characterId: string;
    artHeight: number;
    palette: Palette;
    scale: number;
    version?: string;
  },
): Atlas {
  return {
    frames: sheet.frames.map((frame) => ({
      filename: `${frame.animation} ${frame.index}`,
      frame: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frame.width, h: frame.height },
      sourceSize: { w: frame.width, h: frame.height },
      duration: frame.durationMs,
    })),
    meta: {
      app: ATLAS_APP,
      version: options.version ?? '1',
      image: options.image,
      // Indexed, 8 bits per pixel — the same claim the PNG itself makes.
      format: 'I8',
      size: { w: sheet.width, h: sheet.height },
      scale: String(options.scale),
      frameTags: sheet.animations.map((animation) => ({
        name: animation.name,
        from: animation.from,
        to: animation.to,
        // Aseprite has no "plays once": a one-shot is a forward tag the engine
        // is told not to repeat, and `meta.sero.once` is where it is told.
        direction: animation.loop === 'pingpong' ? 'pingpong' : 'forward',
      })),
      sero: {
        character: options.characterId,
        artHeight: options.artHeight,
        anchors: sheet.animations.map((animation) => ({
          animation: animation.name,
          x: animation.anchorX,
          y: animation.anchorY,
        })),
        palette: options.palette.map((entry) => toHex(entry)),
        once: sheet.animations.filter((animation) => animation.loop === 'once').map((a) => a.name),
      },
    },
  };
}
