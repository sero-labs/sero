/**
 * Engine images to review PNGs.
 *
 * The engine returns float RGBA `Img`s and encodes nothing (AD-026: the
 * engine is pure; codecs live in the runtime). Review pictures are for eyes —
 * the author model's and Dan's — so frames are flattened onto one neutral
 * backdrop (the soft shadow must stay visible, and a vision model given
 * transparency composites it against whatever it likes), scaled with hard
 * pixels, and encoded through the existing indexed-PNG codec.
 */

import type { Color } from '@sero-ai/ink-and-bones';
import { Img, frameStrip, scaleNearest } from '@sero-ai/ink-and-bones';

import type { Rgb } from '../../engine/types';
import { encodeIndexedPng } from '../png';
import type { PuppetBaked } from './run';

/** Dark, slightly violet, far from any plausible character ramp — the frame
 * reads against it whether the palette is dusk or ember. */
const REVIEW_BG: Color = [0.10, 0.09, 0.14, 1];

/** Whole frames at 4x wrap into readable rows; the rest pose alone gets 8x.
 * A clip near the pixel budget drops to 2x or 1x — the strip stays bounded
 * (~8M px, float RGBA) instead of scaling quadratically past a gigabyte. */
const STRIP_SCALE = 4;
const REST_SCALE = 8;
const MAX_STRIP_PIXELS = 8_000_000;

function stripScale(framePixels: number): number {
  for (const k of [STRIP_SCALE, 2]) {
    if (framePixels * k * k <= MAX_STRIP_PIXELS) return k;
  }
  return 1;
}

function flatten(src: Img, bg: Color): Img {
  const out = new Img(src.w, src.h);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      out.set(x, y, bg);
      out.blend(x, y, src.get(x, y));
    }
  }
  return out;
}

/** Encode a fully opaque Img as an indexed PNG. Review images grade to a
 * couple of dozen colours; more than 255 means this was fed the wrong image. */
export function imgToPng(img: Img): Buffer {
  const cells = new Int16Array(img.w * img.h);
  const palette: Rgb[] = [];
  const indexOf = new Map<number, number>();
  const bytes = img.toRGBA8();
  for (let i = 0; i < img.w * img.h; i++) {
    const key = (bytes[i * 4] << 16) | (bytes[i * 4 + 1] << 8) | bytes[i * 4 + 2];
    let index = indexOf.get(key);
    if (index === undefined) {
      index = palette.length;
      palette.push([bytes[i * 4], bytes[i * 4 + 1], bytes[i * 4 + 2]]);
      indexOf.set(key, index);
    }
    cells[i] = index;
  }
  return encodeIndexedPng(cells, img.w, img.h, palette, { transparent: false });
}

export interface ReviewImages {
  /** The rest pose at 8x. */
  rest: Buffer;
  /** One wrapped frame strip per clip, in clip order. */
  strips: Map<string, Buffer>;
  /** The scale each strip was actually rendered at — the caption must say
   * what the picture is, and a budget-sized clip drops below 4x. */
  scales: Map<string, number>;
}

export function renderReviewImages(baked: PuppetBaked): ReviewImages {
  const strips = new Map<string, Buffer>();
  const scales = new Map<string, number>();
  for (const [name, clip] of baked.baked) {
    const framePixels = clip.frames.reduce((sum, frame) => sum + frame.w * frame.h, 0);
    const k = stripScale(framePixels);
    const scaled = clip.frames.map((frame) => scaleNearest(flatten(frame, REVIEW_BG), k));
    strips.set(name, imgToPng(frameStrip(scaled, REVIEW_BG)));
    scales.set(name, k);
  }
  return {
    rest: imgToPng(scaleNearest(flatten(baked.rest, REVIEW_BG), REST_SCALE)),
    strips,
    scales,
  };
}
